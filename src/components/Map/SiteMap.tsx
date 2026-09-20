import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LngLatBoundsLike, Map as MapLibreGLMap } from "maplibre-gl";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast, WindSample } from "../../domain/types.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { classifyFreshness, formatDownloadTime } from "../../domain/freshness.ts";
import { daylightFactor, isNightAt } from "../../domain/skyBand.ts";
import { selectEffectiveSample, type EffectiveSample } from "../../domain/effectiveSample.ts";
import { interpolateWindAtHeight } from "../../domain/heightInterpolation.ts";
import { WindRose } from "../WindRose/index.ts";
import { AppHeader } from "../AppHeader/AppHeader.tsx";
import { BottomBar } from "../BottomBar/BottomBar.tsx";
import { SiteModeToggle, type SiteMode } from "../SiteModeToggle/SiteModeToggle.tsx";
import { MapLayersPanel } from "../MapLayersPanel/MapLayersPanel.tsx";
import { ParameterLegend } from "../ParameterLegend/ParameterLegend.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { SiteEditorPanel } from "../SiteEditor/SiteEditorPanel.tsx";
import { IssuesPanel } from "../Issues/IssuesPanel.tsx";
import { emptyDraft, siteToDraft, sitePathFor, type SiteDraft } from "../../domain/siteEditor.ts";
import { CAN_EDIT } from "../../app/adminMode.ts";
import { useIsCompact } from "../../app/useIsCompact.ts";
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

// Forecast/wind-grid data is published every ~5 minutes by
// scripts/collect-forecasts.ts (server-side), not fetched live per
// visitor - these thresholds flag when the publish job itself seems to
// have STOPPED, not every visitor's page-load timing relative to the last
// run.
//
// Three hours, not one. At a five-minute cadence an hour is twelve missed
// runs, which sounds decisive until you remember what actually produces
// it: GitHub Actions' scheduler routinely delays or drops cron runs under
// load, and this repository is not entitled to better. So an hour caught
// ordinary scheduler weather and put a brown banner over the map for it -
// and a warning shown when nothing is wrong is a warning people learn to
// scroll past, which costs us the one time it matters.
//
// Three hours cannot be jitter. It is ~36 consecutive missed runs, and
// the forecast underneath is still a forecast - hourly model data running
// 60 hours ahead, so a three-hour-old download is not three hours of
// missing weather, it is a slightly older run of the same weather. That
// is the honest reason this can afford to wait.
const FORECAST_FRESH_MINUTES = 15;
const FORECAST_STALE_MINUTES = 180;

/** "4 h" / "2 days" - coarse on purpose, since this only ever describes something broken. */
function formatAge(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${Math.max(1, hours)} h`;
  return `${Math.floor(hours / 24)} days`;
}

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
  daylight: number,
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
      daylight={daylight}
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
  const [issuesOpen, setIssuesOpen] = useState(false);
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
  const isCompact = useIsCompact();
  const [showAirspace, setShowAirspace] = useState(false);
  const [showRasp, setShowRasp] = useState(false);
  const [selectedRaspParam, setSelectedRaspParam] = useState<RaspParamKey>("wstar");
  // The bottom bar's real height varies (phone's two-row arrangement,
  // labels wrapping on narrow screens) - measured rather than guessed so
  // SiteSheet/ParameterLegend can anchor themselves just above it instead
  // of sliding underneath and becoming unclickable (found via an E2E
  // diagnostic in an earlier milestone, and the same class of bug has
  // since appeared three times). The right-hand control panel is
  // positioned independently and never anchors against this - only the
  // bottom chrome does (§ Startvind UX Direction).
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  useEffect(() => {
    const el = bottomBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setBottomBarHeight(entries[0].contentRect.height));
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
  // Roads/contours/place-names are no longer offered as a toggle; the map
  // is the relief style it has always shown by default. buildTopoStyle
  // stays in mapStyles.ts so bringing any of it back is a style decision
  // rather than a rewrite.
  const mapStyle = useMemo(() => buildStyleForRoads(false), []);
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
  // A generic "no RASP for this hour" is indistinguishable from a broken
  // app, and RASP has in fact been missing most of the timeline because
  // the soaring backend stopped publishing new runs - not because of
  // anything the map is doing. So the notice states the real horizon and
  // the real publish time, letting a pilot tell "outside the model's
  // range" apart from "this data is two days old".
  const raspLastValidTime = selectedParameter?.validTimes.at(-1) ?? null;
  const raspCoverageEnd = raspLastValidTime !== null ? formatDownloadTime(raspLastValidTime, new Date()) : null;

  // Flag using whichever of the two publish timestamps is OLDER - if
  // either dataset's refresh cron has stalled, that's worth surfacing
  // even if the other one is current.
  const oldestGeneratedAt = [forecastGeneratedAt, gridGeneratedAt].filter((v): v is string => v !== null).sort()[0] ?? null;
  const isForecastDataStale =
    oldestGeneratedAt !== null &&
    classifyFreshness(oldestGeneratedAt, new Date(), FORECAST_FRESH_MINUTES, FORECAST_STALE_MINUTES) === "stale";
  const forecastAgeLabel =
    oldestGeneratedAt !== null ? formatAge(Date.now() - new Date(oldestGeneratedAt).getTime()) : "";

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
    <div className="app-shell">
      {/* Top header (§ Startvind UX Direction): brand, beta badge, real
          data-update status and Add site. The brand mark used to float over
          the map's top-right corner; it is part of the header now, so the
          map surface below carries no identity chrome at all. */}
      <AppHeader
        sitesMeasured={isLiveMode}
        raspOn={showRasp}
        windUpdated={windUpdated}
        raspUpdated={raspUpdated}
        // No publish target (a built copy with no Worker configured) means
        // a save could only ever fail, so the button is not offered at all
        // - see app/editorApi.ts. Where one exists, the editor opens for
        // anyone, and what gates a save is the contributor block, not this
        // button. Shown to every visitor, deliberately (decided
        // 2026-09-18) - see app/adminMode.ts's CAN_EDIT. It appeared by
        // accident once and was hidden again; this is the considered
        // version of the same thing, with Add site inside the header menu
        // rather than as a button competing with the map.
        onAddSite={CAN_EDIT ? openCreateEditor : undefined}
        onOpenIssues={CAN_EDIT ? () => setIssuesOpen(true) : undefined}
      />
      {issuesOpen && <IssuesPanel onClose={() => setIssuesOpen(false)} />}
      <div
        className="site-map-container"
        data-testid="site-map"
        style={{ "--bottom-bar-height": `${bottomBarHeight}px` } as React.CSSProperties}
      >
        {/* Upper-right controls (§ Startvind UX Direction): the Ridge/Winch
            selector and one organised map-layer panel, in that order. This
            replaces the old top-left vertical tool stack entirely. */}
        <div className="map-controls" data-testid="map-controls">
          <SiteModeToggle mode={siteMode} onChange={setSiteMode} />
          <MapLayersPanel
            showAirspace={showAirspace}
            onAirspaceChange={setShowAirspace}
            showRasp={showRasp}
            onRaspChange={setShowRasp}
            selectedRaspParam={selectedRaspParam}
            onRaspParamChange={setSelectedRaspParam}
            availableRaspParams={availableRaspParams}
          />
        </div>
      {visibleSites.length === 0 && (
        <div className="site-mode-empty-notice">
          No winch sites with a verified location yet - see docs/SITE_DATA_AUDIT.md.
        </div>
      )}
      {isForecastDataStale && (
        // Says how old, rather than "may be stale". By the time this
        // appears something really has stopped, and "4 h" tells you
        // whether to care in a way that a hedge never does.
        <div className="data-staleness-notice" data-testid="data-staleness-notice">
          Forecast data is {forecastAgeLabel} old - the update job has stopped.
        </div>
      )}
      {isRaspUnavailable && (
        <div className="rasp-unavailable-notice" data-testid="rasp-unavailable-notice">
          {soaringError ? (
            "RASP thermal data unavailable."
          ) : raspCoverageEnd !== null && raspUpdated !== null ? (
            <>
              No RASP thermal data for this hour - the latest published run only reaches {raspCoverageEnd}.
              <br />
              Published {raspUpdated}; nothing newer has been published since.
            </>
          ) : (
            "No RASP thermal data for this forecast hour."
          )}
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
        // Keeps fitted markers clear of the persistent chrome so they
        // never land unclickable behind it - found via an E2E diagnostic
        // during the MapLibre port, and revisited every time the chrome's
        // shape changed since (this is one of those times). Bottom clears
        // the bottom bar; left clears the upper-left control column on
        // desktop, where it is permanently open and ~260px wide. Read once,
        // at map creation - fitBounds only runs on mount, which is exactly
        // what gives "no map jump" later.
        boundsPadding={
          isCompact
            ? { top: 40, bottom: 210, left: 24, right: 24 }
            : { top: 40, bottom: 180, left: 300, right: 60 }
        }
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
              // Each site's own sunset, not a shared one: Dokkedal is far
              // enough north-west of Skane for the difference to be visible
              // on the same map at the same hour.
              const daylight = daylightFactor(
                selectedHourIso ? new Date(selectedHourIso) : new Date(),
                site.coordinates,
              );
              const { html } = buildRoseHtml(site, selected, sample, weatherKind, isNight, daylight);
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
          isNight={isNightAt(selectedHourIso, selectedSite.coordinates)}
          daylight={daylightFactor(
            selectedHourIso ? new Date(selectedHourIso) : new Date(),
            selectedSite.coordinates,
          )}
          onClose={() => setSelectedId(null)}
          // Always present on an open site, same reasoning as Add site.
          onEdit={CAN_EDIT ? () => openEditEditor(selectedSite) : undefined}
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
        {/* Bottom bar (§ Startvind UX Direction): Current Wind, the
            forecast timeline, and altitude. Forecast navigation only -
            map layers and site selection live in the upper-right panel. */}
        <BottomBar
          isLiveMode={isLiveMode}
          onStart={handleStart}
          hours={hours}
          selectedIndex={sliderIndex}
          onTimeChange={handleTimeChange}
          altitudeM={altitudeM}
          onAltitudeChange={handleAltitudeChange}
          compact={isCompact}
          barRef={bottomBarRef}
        />
      </div>
    </div>
  );
}
