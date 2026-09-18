import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LngLatBoundsLike, Map as MapLibreGLMap } from "maplibre-gl";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast, WindSample } from "../../domain/types.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { classifyFreshness, formatDownloadTime } from "../../domain/freshness.ts";
import { isNightAt } from "../../domain/skyBand.ts";
import { selectEffectiveSample, type EffectiveSample } from "../../domain/effectiveSample.ts";
import { interpolateWindAtHeight } from "../../domain/heightInterpolation.ts";
import { WindRose } from "../WindRose/index.ts";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { StartButton } from "../StartButton/StartButton.tsx";
import { SourceStatus } from "../SourceStatus/SourceStatus.tsx";
import { SiteModeToggle, type SiteMode } from "../SiteModeToggle/SiteModeToggle.tsx";
import { AirspaceToggle } from "../AirspaceToggle/AirspaceToggle.tsx";
import { RoadsToggle } from "../RoadsToggle/RoadsToggle.tsx";
import { RaspControl } from "../RaspControl/RaspControl.tsx";
import { HeightControl } from "../HeightControl/HeightControl.tsx";
import { ParameterLegend } from "../ParameterLegend/ParameterLegend.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { SiteEditorPanel } from "../SiteEditor/SiteEditorPanel.tsx";
import { emptyDraft, siteToDraft, sitePathFor, type SiteDraft } from "../../domain/siteEditor.ts";
import { ADMIN_MODE } from "../../app/adminMode.ts";
import { WindArrow } from "../WindArrowField/index.ts";
import { computeSiteBounds } from "./mapBounds.ts";
import { MapLibreMap } from "./MapLibreMap.tsx";
import { MapMarker } from "./MapMarker.tsx";
import { buildStyleForRoads } from "./mapStyles.ts";
import { useSiteForecasts } from "../../app/useSiteForecasts.ts";
import { useLiveData } from "../../app/useLiveData.ts";
import { useWindGrid } from "../../app/useWindGrid.ts";
import { usePrefersReducedMotion } from "../../app/usePrefersReducedMotion.ts";
import { useSoaringManifest, resolveSoaringUrl } from "../../app/useSoaringManifest.ts";
import { buildWindFieldGrid, windGridPointAtHeight } from "../../domain/windField.ts";
import { findNearestValidTime, findFileForValidTime, RASP_PARAM_KEYS, type RaspParamKey } from "../../domain/soaring.ts";

const MARKER_SIZE = 48;
const SELECTED_MARKER_SIZE = 60;
const SURFACE_HEIGHT_M = 10;
const SURFACE_ALTITUDE_M = 0;
const ARROW_SIZE = 39; // 1.5x the original 26px, per user feedback

// Forecast/wind-grid data is now published every ~5 minutes by
// scripts/collect-forecasts.ts (server-side), not fetched live per
// visitor - these thresholds flag when the publish cron itself seems
// to have stopped working (way beyond normal cadence jitter), not
// every visitor's exact page-load timing relative to the last run.
const FORECAST_FRESH_MINUTES = 15;
const FORECAST_STALE_MINUTES = 60;

/**
 * Non-interactive - never intercepts clicks meant for site markers or the
 * map itself. Takes the slider-indexed single value, not the whole
 * point's hourly arrays.
 *
 * Only used for the prefers-reduced-motion fallback now - the normal
 * path is the animated WindParticleLayer (windParticleLayer.ts), which
 * replaced this as the default per-point DOM marker approach (961
 * animated DOM markers was the thing explicitly ruled out).
 */
function buildWindArrowHtml(windDirectionDeg: number | null, windSpeedMs: number | null): string | null {
  if (windDirectionDeg === null || windSpeedMs === null) return null;
  return renderToStaticMarkup(
    <div style={{ pointerEvents: "none" }}>
      <WindArrow windDirectionDeg={windDirectionDeg} windSpeedMs={windSpeedMs} size={ARROW_SIZE} />
    </div>,
  );
}

// Reduced-motion fallback shows a coarser static field (not the full
// 961-point density) - it's rendered once as plain static DOM markers
// (no per-frame updates, so the "no 961 animated DOM markers"
// constraint doesn't apply here), but the full grid's density was tuned
// for a flowing particle field, not a static one; a stride keeps the
// static fallback readable rather than visually noisy.
const REDUCED_MOTION_STRIDE = 3;

function subsampleForStaticDisplay<T>(points: T[], stride: number): T[] {
  const side = Math.round(Math.sqrt(points.length));
  if (side * side !== points.length) return points;
  return points.filter((_, i) => Math.floor(i / side) % stride === 0 && (i % side) % stride === 0);
}

interface ForecastPoint {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  weatherKind: SiteForecast["weatherKind"][number];
  effectiveHeightM: number | null;
  heightSupported: boolean;
}

/**
 * altitudeM === 0 (Surface) always reads the 10m series. Any other value
 * interpolates across the discrete model heights (§ FlyWeather Interaction
 * Model - replaces the old per-site soaring_height.agl_m gate with one
 * global altitude shared by every site). heightSupported now reflects
 * genuine data availability for this hour, not a per-site curation flag -
 * `interpolateWindAtHeight` already clamps non-extrapolating and reports
 * the real effective height when altitudeM exceeds the data's real ceiling.
 */
function forecastPointAt(forecast: SiteForecast | undefined, index: number, altitudeM: number): ForecastPoint {
  const weatherKind = forecast?.weatherKind[index] ?? "unknown";

  if (!forecast || index < 0 || index >= forecast.hours.length) {
    return {
      windDirectionDeg: null,
      windSpeedMs: null,
      windGustMs: null,
      weatherKind,
      effectiveHeightM: null,
      heightSupported: altitudeM === SURFACE_ALTITUDE_M,
    };
  }

  if (altitudeM === SURFACE_ALTITUDE_M) {
    return {
      windDirectionDeg: forecast.heights[SURFACE_HEIGHT_M].windDirectionDeg[index] ?? null,
      windSpeedMs: forecast.heights[SURFACE_HEIGHT_M].windSpeedMs[index] ?? null,
      windGustMs: forecast.windGustMs[index] ?? null,
      weatherKind,
      effectiveHeightM: SURFACE_HEIGHT_M,
      heightSupported: true,
    };
  }

  const samples = MODEL_HEIGHTS_M.map((h) => ({
    heightM: h,
    windDirectionDeg: forecast.heights[h].windDirectionDeg[index] ?? null,
    windSpeedMs: forecast.heights[h].windSpeedMs[index] ?? null,
  }));
  const interpolated = interpolateWindAtHeight(altitudeM, samples);
  return {
    windDirectionDeg: interpolated.windDirectionDeg,
    windSpeedMs: interpolated.windSpeedMs,
    windGustMs: null, // gust isn't modeled at height, only at surface
    weatherKind,
    effectiveHeightM: interpolated.effectiveHeightM,
    heightSupported: interpolated.effectiveHeightM !== null,
  };
}

function buildRoseHtml(
  site: LocatedSite,
  selected: boolean,
  sample: EffectiveSample,
  weatherKind: SiteForecast["weatherKind"][number],
  isNight: boolean,
): { html: string; size: number } {
  const size = selected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
  const sector = site.sector ? site.sector.ranges.map((r) => ({ fromDeg: r.from_deg, toDeg: r.to_deg })) : null;
  const { state } = evaluateFlyability(
    sample.windDirectionDeg,
    sample.windSpeedMs,
    sample.windGustMs,
    site.sector ?? null,
    site.wind,
  );

  const html = renderToStaticMarkup(
    <WindRose
      size={size}
      sector={sector}
      state={state}
      windDirectionDeg={sample.windDirectionDeg}
      windSpeedMs={sample.windSpeedMs}
      weatherKind={weatherKind}
      isNight={isNight}
    />,
  );
  return { html, size };
}

export interface SiteMapProps {
  sites: LocatedSite[];
  /** Every id in the catalogue (archived included), for the editor's duplicate check. */
  allSiteIds?: string[];
  freshMinutes: number;
  staleMinutes: number;
}

export function SiteMap({ sites, allSiteIds = [], freshMinutes, staleMinutes }: SiteMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [altitudeM, setAltitudeM] = useState(SURFACE_ALTITUDE_M);
  // Sticky, not derived: the task is explicit that scrubbing the sliders
  // back to their start values does NOT re-enter live mode on its own -
  // only pressing START does. See handleStart/handleTimeChange/
  // handleAltitudeChange below.
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [siteMode, setSiteMode] = useState<SiteMode>("soaring");
  // The open editor, or null. Only ever set from the admin-gated buttons,
  // so a normal visitor can never reach it - see app/adminMode.ts.
  const [editor, setEditor] = useState<
    { mode: "create" | "edit"; draft: SiteDraft; previousPath?: string } | null
  >(null);
  // Captured from MapLibreMap's render prop purely so "Add site" can
  // prefill the coordinates you are actually looking at - much nicer than
  // typing a lat/lon, and the cheapest part of the whole feature.
  const mapRef = useRef<MapLibreGLMap | null>(null);

  function openCreateEditor() {
    const centre = mapRef.current?.getCenter();
    setEditor({ mode: "create", draft: emptyDraft(centre?.lat ?? 55.7, centre?.lng ?? 13.2) });
  }

  function openEditEditor(site: LocatedSite) {
    const draft = siteToDraft(site);
    setEditor({ mode: "edit", draft, previousPath: sitePathFor(draft) });
  }

  // The dev endpoint has already rewritten public/generated/sites.json, so
  // a reload is the honest way to pick it up: it re-reads the catalogue
  // through the app's normal load path rather than patching a second copy
  // of the site list in memory and risking the two disagreeing.
  function handleSaved() {
    setEditor(null);
    window.location.reload();
  }
  const [showAirspace, setShowAirspace] = useState(false);
  const [showRoads, setShowRoads] = useState(false);
  const [showRasp, setShowRasp] = useState(false);
  const [selectedRaspParam, setSelectedRaspParam] = useState<RaspParamKey>("wstar");
  // The source-status bar's real height varies (RASP badge appearing,
  // text wrapping on narrow screens) - measured rather than guessed so
  // SiteSheet/ParameterLegend can anchor themselves just above it instead
  // of sliding underneath and becoming unclickable (found via an E2E
  // diagnostic in an earlier milestone). The top-left tool stack is
  // positioned independently and never anchors against this - only the
  // bottom chrome (source-status bar + timeline) does (§ FlyWeather GUI
  // Reorganization + Coherent Height Wind item 21).
  const sourceStatusBarRef = useRef<HTMLDivElement>(null);
  const [sourceStatusBarHeight, setSourceStatusBarHeight] = useState(0);
  useEffect(() => {
    const el = sourceStatusBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setSourceStatusBarHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleTimeChange(index: number) {
    setSliderIndex(index);
    if (index !== 0) setIsLiveMode(false);
  }

  function handleAltitudeChange(m: number) {
    setAltitudeM(m);
    if (m !== SURFACE_ALTITUDE_M) setIsLiveMode(false);
  }

  function handleStart() {
    setIsLiveMode(true);
    setSliderIndex(0);
    setAltitudeM(SURFACE_ALTITUDE_M);
  }

  // Bounds/fit are computed from the full located set regardless of
  // siteMode, same "no map jump" principle as altitude/roads - switching
  // to Winch never recenters the map just because that set is currently
  // empty (neither winch-brandstad nor winch-urasa has a usable
  // coordinate yet - see docs/SITE_DATA_AUDIT.md).
  const bounds = useMemo(() => computeSiteBounds(sites), [sites]);
  const visibleSites = useMemo(
    () => sites.filter((s) => (siteMode === "winch" ? s.group === "winch" : s.group !== "winch")),
    [sites, siteMode],
  );
  const mapStyle = useMemo(() => buildStyleForRoads(showRoads), [showRoads]);
  // Scoped to visibleSites, not the full sites list, so a selection from
  // the other siteMode's marker set doesn't leave a stale sheet open
  // for a site no longer shown on the map.
  const selectedSite = visibleSites.find((s) => s.id === selectedId) ?? null;
  const { forecastsBySiteId, hours, generatedAt: forecastGeneratedAt } = useSiteForecasts(sites);
  const { data: liveData } = useLiveData();
  const { points: windGridPoints, generatedAt: gridGeneratedAt } = useWindGrid();
  const prefersReducedMotion = usePrefersReducedMotion();
  const windFieldGrid = useMemo(
    () => buildWindFieldGrid(windGridPoints, sliderIndex, altitudeM),
    [windGridPoints, sliderIndex, altitudeM],
  );
  const staticWindPoints = useMemo(
    () => (prefersReducedMotion ? subsampleForStaticDisplay(windGridPoints, REDUCED_MOTION_STRIDE) : []),
    [prefersReducedMotion, windGridPoints],
  );

  const { manifest: soaringManifest, loading: soaringLoading, error: soaringError } = useSoaringManifest();
  // Whichever of the 4 RASP parameters is currently selected - the manifest
  // may not (yet) contain every key (e.g. an older backend deploy), so this
  // is looked up by key rather than assumed present.
  const availableRaspParams = soaringManifest
    ? RASP_PARAM_KEYS.filter((k) => soaringManifest.parameters[k] !== undefined)
    : [];
  const selectedParameter = soaringManifest?.parameters[selectedRaspParam] ?? null;
  const selectedHourIso = hours[sliderIndex] ?? null;
  // Matched by actual valid timestamp (never by array index - two
  // completely different data pipelines, no reason their hours would
  // ever align positionally even though they usually align in wall-clock
  // time), per docs/soaring.ts's tolerance rule.
  const matchedRaspValidTime =
    selectedParameter && selectedHourIso ? findNearestValidTime(selectedParameter.validTimes, selectedHourIso) : null;
  const matchedRaspFile =
    selectedParameter && matchedRaspValidTime ? findFileForValidTime(selectedParameter, matchedRaspValidTime) : null;
  const raspOverlay =
    showRasp && selectedParameter && matchedRaspFile
      ? { imageUrl: resolveSoaringUrl(matchedRaspFile.raster), bbox: selectedParameter.grid.bbox }
      : null;
  // Only worth telling the user about once the manifest itself has
  // resolved (loaded or failed) - avoids a flash of "unavailable" while
  // the fetch is still in flight on first load.
  const isRaspUnavailable = showRasp && !soaringLoading && !raspOverlay;

  // Flag using whichever of the two publish timestamps is OLDER - if
  // either dataset's refresh cron has stalled, that's worth surfacing
  // even if the other one is current.
  const oldestGeneratedAt = [forecastGeneratedAt, gridGeneratedAt].filter((v): v is string => v !== null).sort()[0] ?? null;
  const isForecastDataStale =
    oldestGeneratedAt !== null &&
    classifyFreshness(oldestGeneratedAt, new Date(), FORECAST_FRESH_MINUTES, FORECAST_STALE_MINUTES) === "stale";

  // Literal download-time labels for SourceStatus's provenance chips (e.g.
  // "06:00 TODAY") - the regional wind field uses the grid publish time
  // (not the per-site forecast's, which can differ), RASP uses its own
  // manifest's generatedAt. Both null until their respective data has
  // actually loaded.
  const windUpdated = gridGeneratedAt !== null ? formatDownloadTime(gridGeneratedAt, new Date()) : null;
  const raspUpdated = soaringManifest !== null ? formatDownloadTime(soaringManifest.source.generatedAt, new Date()) : null;

  if (!bounds) {
    return <div className="app-status">No sites with known coordinates yet.</div>;
  }

  // MapLibre uses [lng, lat] order - the opposite of Leaflet's [lat, lng].
  const maplibreBounds: LngLatBoundsLike = [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
  ];

  function effectiveSampleFor(site: LocatedSite) {
    const point = forecastPointAt(forecastsBySiteId[site.id], sliderIndex, altitudeM);
    const liveEntry = liveData?.sites[site.id];
    // A surface anemometer never stands in for wind aloft (§7.2), and live
    // observations only ever apply once the user is actually in START/live
    // mode - not merely because the slider happens to be back at index 0.
    const liveSample: WindSample | null =
      altitudeM === SURFACE_ALTITUDE_M && isLiveMode && liveEntry?.status === "ok" ? liveEntry.sample : null;
    const sample = selectEffectiveSample(isLiveMode, liveSample, point, new Date(), freshMinutes, staleMinutes);
    const effectiveHeightM = sample.sourceKind === "observation" ? SURFACE_HEIGHT_M : point.effectiveHeightM;
    return { sample, weatherKind: point.weatherKind, effectiveHeightM, heightSupported: point.heightSupported };
  }

  const selectedResult = selectedSite ? effectiveSampleFor(selectedSite) : null;

  return (
    <div
      className="site-map-container"
      data-testid="site-map"
      style={{ "--source-status-height": `${sourceStatusBarHeight}px` } as React.CSSProperties}
    >
      {/* Top-right brand mark (replaces the old centered UPPVIND
          wordmark) - identity only, never a control. Top-right is the one
          map corner with no chrome in it: the tool stack and MapLibre's own
          zoom control are both top-left, and everything else anchors to the
          bottom. Non-interactive so it can't swallow a map drag. */}
      <img
        className="startvind-logo"
        src={`${import.meta.env.BASE_URL}startvind-logo.png`}
        alt="Startvind"
        width={158}
        height={74}
      />
      {/* Top-left tool stack (§ FlyWeather GUI Reorganization + Coherent
          Height Wind items 2-8): site selection, map overlays, and the
          collapsible HEIGHT control - a deliberate hierarchy, not one
          generic button row. Never anchors against the bottom chrome. */}
      <div className="tool-stack" data-testid="tool-stack">
        {/* Admin-only, and invisible to pilots - see app/adminMode.ts for
            why a URL flag rather than a password. */}
        {ADMIN_MODE && (
          <button type="button" className="tool-button" onClick={openCreateEditor} data-testid="add-site-button">
            + Add site
          </button>
        )}
        <SiteModeToggle mode={siteMode} onChange={setSiteMode} />
        <RoadsToggle show={showRoads} onChange={setShowRoads} />
        <AirspaceToggle show={showAirspace} onChange={setShowAirspace} />
        <RaspControl
          show={showRasp}
          onChange={setShowRasp}
          selectedParam={selectedRaspParam}
          onParamChange={setSelectedRaspParam}
          availableParams={availableRaspParams}
        />
        <HeightControl altitudeM={altitudeM} onChange={handleAltitudeChange} />
      </div>
      {/* Bottom chrome: forecast navigation + data provenance only (item
          21) - Roads/Airspace/RASP/Ridge/Winch never live down here. */}
      <div className="source-status-bar" data-testid="source-status-bar" ref={sourceStatusBarRef}>
        <StartButton isLiveMode={isLiveMode} onStart={handleStart} />
        <SourceStatus sitesMeasured={isLiveMode} raspOn={showRasp} windUpdated={windUpdated} raspUpdated={raspUpdated} />
      </div>
      {visibleSites.length === 0 && (
        <div className="site-mode-empty-notice">
          No winch sites with a verified location yet - see docs/SITE_DATA_AUDIT.md.
        </div>
      )}
      {isForecastDataStale && (
        <div className="data-staleness-notice" data-testid="data-staleness-notice">
          Forecast data hasn't updated in over an hour - may be stale.
        </div>
      )}
      {isRaspUnavailable && (
        <div className="rasp-unavailable-notice" data-testid="rasp-unavailable-notice">
          {soaringError
            ? "RASP thermal data unavailable."
            : "No RASP thermal data for this forecast hour."}
        </div>
      )}
      {raspOverlay && selectedParameter && soaringManifest && (
        <ParameterLegend
          label={selectedParameter.label}
          technicalLabel={selectedParameter.technicalLabel}
          unit={selectedParameter.unit}
          colorScale={selectedParameter.colorScale}
          provenance={`${soaringManifest.source.provider} ${soaringManifest.source.model} · model run ${new Date(soaringManifest.source.modelRun).toISOString().slice(0, 16).replace("T", " ")}Z`}
        />
      )}
      <MapLibreMap
        style={mapStyle}
        bounds={maplibreBounds}
        // Bottom padding keeps fitted markers clear of the persistent
        // 98px time-slider bar PLUS the source-status bar now sitting
        // directly above it (App.css's .time-slider/.source-status-bar
        // heights) so they never land unclickable behind either - found via
        // an E2E diagnostic during the MapLibre port, revisited each time
        // the bottom chrome's shape changed since.
        boundsPadding={{ top: 40, bottom: 200, left: 40, right: 40 }}
        maxZoom={12}
        showAirspace={showAirspace}
        raspOverlay={raspOverlay}
        windGrid={windFieldGrid}
        // Animated wind is now always on (§ FlyWeather GUI Reorganization +
        // Coherent Height Wind item 1) - the only remaining condition is
        // the accessibility one, prefers-reduced-motion, which was never a
        // user-facing toggle.
        windMotionEnabled={!prefersReducedMotion}
        className="site-map"
      >
        {(map) => {
          mapRef.current = map;
          return (
          <>
            {prefersReducedMotion &&
              staticWindPoints.map((point, i) => {
                const { windDirectionDeg, windSpeedMs } = windGridPointAtHeight(point, sliderIndex, altitudeM);
                const html = buildWindArrowHtml(windDirectionDeg, windSpeedMs);
                if (!html) return null;
                return (
                  <MapMarker
                    key={`wind-arrow-${i}`}
                    map={map}
                    lng={point.lon}
                    lat={point.lat}
                    html={html}
                    className="wind-arrow-icon"
                    interactive={false}
                    zIndex={0}
                  />
                );
              })}
            {visibleSites.map((site) => {
              const { sample, weatherKind } = effectiveSampleFor(site);
              const selected = site.id === selectedId;
              const isNight = isNightAt(selectedHourIso, site.coordinates);
              const { html } = buildRoseHtml(site, selected, sample, weatherKind, isNight);
              return (
                <MapMarker
                  key={site.id}
                  map={map}
                  lng={site.coordinates.lon}
                  lat={site.coordinates.lat}
                  html={html}
                  className="rose-marker-icon"
                  zIndex={selected ? 1000 : 10}
                  onClick={() => setSelectedId(site.id)}
                  testId={`site-marker-${site.id}`}
                />
              );
            })}
          </>
          );
        }}
      </MapLibreMap>
      {selectedSite && selectedResult && (
        <SiteSheet
          site={selectedSite}
          sample={{ ...selectedResult.sample, weatherKind: selectedResult.weatherKind }}
          effectiveHeightM={selectedResult.effectiveHeightM}
          heightSupported={selectedResult.heightSupported}
          selectedTimestamp={hours[sliderIndex] ?? null}
          isNight={isNightAt(selectedHourIso, selectedSite.coordinates)}
          onClose={() => setSelectedId(null)}
          onEdit={ADMIN_MODE ? () => openEditEditor(selectedSite) : undefined}
        />
      )}
      {editor && (
        <SiteEditorPanel
          initialDraft={editor.draft}
          mode={editor.mode}
          allIds={allSiteIds}
          previousPath={editor.previousPath}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}
      <TimeSlider hours={hours} selectedIndex={sliderIndex} onChange={handleTimeChange} />
    </div>
  );
}
