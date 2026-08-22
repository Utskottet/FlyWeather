import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LngLatBoundsLike } from "maplibre-gl";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast, WindSample } from "../../domain/types.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { classifyFreshness } from "../../domain/freshness.ts";
import { selectEffectiveSample, provenanceLine, type EffectiveSample } from "../../domain/effectiveSample.ts";
import { interpolateWindAtHeight } from "../../domain/heightInterpolation.ts";
import { WindRose } from "../WindRose/index.ts";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { AltitudeSlider } from "../AltitudeSlider/AltitudeSlider.tsx";
import { StartButton } from "../StartButton/StartButton.tsx";
import { SiteModeToggle, type SiteMode } from "../SiteModeToggle/SiteModeToggle.tsx";
import { AirspaceToggle } from "../AirspaceToggle/AirspaceToggle.tsx";
import { WindToggle } from "../WindToggle/WindToggle.tsx";
import { RoadsToggle } from "../RoadsToggle/RoadsToggle.tsx";
import { RaspToggle } from "../RaspToggle/RaspToggle.tsx";
import { ParameterLegend } from "../ParameterLegend/ParameterLegend.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
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
import { buildWindFieldGrid } from "../../domain/windField.ts";
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
): { html: string; size: number } {
  const size = selected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
  const green = site.rose.green[0];
  const sector = green ? { fromDeg: green.from_deg, toDeg: green.to_deg } : null;
  const { state } = evaluateFlyability(
    sample.windDirectionDeg,
    sample.windSpeedMs,
    sample.windGustMs,
    site.rose.green,
    site.rose.orange,
    site.wind_speed,
  );

  const html = renderToStaticMarkup(
    <WindRose
      size={size}
      sector={sector}
      state={state}
      windDirectionDeg={sample.windDirectionDeg}
      windSpeedMs={sample.windSpeedMs}
      weatherKind={weatherKind}
    />,
  );
  return { html, size };
}

export interface SiteMapProps {
  sites: LocatedSite[];
  freshMinutes: number;
  staleMinutes: number;
}

export function SiteMap({ sites, freshMinutes, staleMinutes }: SiteMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [altitudeM, setAltitudeM] = useState(SURFACE_ALTITUDE_M);
  // Sticky, not derived: the task is explicit that scrubbing the sliders
  // back to their start values does NOT re-enter live mode on its own -
  // only pressing START does. See handleStart/handleTimeChange/
  // handleAltitudeChange below.
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [siteMode, setSiteMode] = useState<SiteMode>("soaring");
  const [showAirspace, setShowAirspace] = useState(false);
  const [showWind, setShowWind] = useState(true);
  const [showRoads, setShowRoads] = useState(false);
  const [showRasp, setShowRasp] = useState(false);
  const [selectedRaspParam, setSelectedRaspParam] = useState<RaspParamKey>("wstar");
  // The bottom controls' real height varies (RASP param selector
  // appearing, provenance text wrapping to its own line on narrow
  // screens) - measured rather than guessed so SiteSheet/ParameterLegend
  // can anchor themselves just above it instead of sliding underneath and
  // becoming unclickable (found via an E2E diagnostic in the prior
  // milestone; this wrapper now covers both control rows).
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const [bottomControlsHeight, setBottomControlsHeight] = useState(0);
  useEffect(() => {
    const el = bottomControlsRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setBottomControlsHeight(entries[0].contentRect.height));
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
    () => sites.filter((s) => (siteMode === "winch" ? s.type === "winch" : s.type !== "winch")),
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
    () => buildWindFieldGrid(windGridPoints, sliderIndex),
    [windGridPoints, sliderIndex],
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
      style={{ "--bottom-controls-height": `${bottomControlsHeight}px` } as React.CSSProperties}
    >
      <div className="bottom-controls" data-testid="bottom-controls" ref={bottomControlsRef}>
        <div className="control-bar" data-testid="control-bar">
          <SiteModeToggle mode={siteMode} onChange={setSiteMode} />
          <RaspToggle show={showRasp} onChange={setShowRasp} />
          <AirspaceToggle show={showAirspace} onChange={setShowAirspace} />
          <WindToggle show={showWind} onChange={setShowWind} />
          <RoadsToggle show={showRoads} onChange={setShowRoads} />
        </div>
        <div className="altitude-bar" data-testid="altitude-bar">
          <StartButton isLiveMode={isLiveMode} onStart={handleStart} />
          <AltitudeSlider altitudeM={altitudeM} onChange={handleAltitudeChange} />
        </div>
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
          paramSelector={{
            selected: selectedRaspParam,
            onChange: setSelectedRaspParam,
            availableParams: availableRaspParams,
          }}
        />
      )}
      <MapLibreMap
        style={mapStyle}
        bounds={maplibreBounds}
        // Bottom padding keeps fitted markers clear of the persistent
        // 112px time-slider bar PLUS the two-row bottom controls now
        // sitting directly above it (App.css's .time-slider/.bottom-controls
        // heights) so they never land unclickable behind either - found via
        // an E2E diagnostic during the MapLibre port (112px case) and again
        // when the control bar moved from top-right to bottom (§ FlyWeather
        // Next UI), not just a cosmetic choice. The bar grew a second row
        // this milestone (altitude slider), so the reserve grew with it.
        boundsPadding={{ top: 40, bottom: 260, left: 40, right: 40 }}
        maxZoom={12}
        showAirspace={showAirspace}
        raspOverlay={raspOverlay}
        windGrid={windFieldGrid}
        windMotionEnabled={showWind && !prefersReducedMotion}
        className="site-map"
      >
        {(map) => (
          <>
            {showWind &&
              prefersReducedMotion &&
              staticWindPoints.map((point, i) => {
                const html = buildWindArrowHtml(
                  point.windDirectionDeg[sliderIndex] ?? null,
                  point.windSpeedMs[sliderIndex] ?? null,
                );
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
              const { html } = buildRoseHtml(site, selected, sample, weatherKind);
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
                />
              );
            })}
          </>
        )}
      </MapLibreMap>
      {selectedSite && selectedResult && (
        <SiteSheet
          site={selectedSite}
          sample={{ ...selectedResult.sample, weatherKind: selectedResult.weatherKind }}
          effectiveHeightM={selectedResult.effectiveHeightM}
          heightSupported={selectedResult.heightSupported}
          selectedTimestamp={hours[sliderIndex] ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
      <TimeSlider
        hours={hours}
        selectedIndex={sliderIndex}
        onChange={handleTimeChange}
        statusText={provenanceLine(isLiveMode)}
      />
    </div>
  );
}
