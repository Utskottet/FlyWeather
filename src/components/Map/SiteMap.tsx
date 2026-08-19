import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LngLatBoundsLike } from "maplibre-gl";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast, WindSample } from "../../domain/types.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { classifyFreshness } from "../../domain/freshness.ts";
import { selectEffectiveSample, type EffectiveSample } from "../../domain/effectiveSample.ts";
import { interpolateWindAtHeight } from "../../domain/heightInterpolation.ts";
import { WindRose } from "../WindRose/index.ts";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { HeightModeToggle, type HeightMode } from "../HeightModeToggle/HeightModeToggle.tsx";
import { SiteModeToggle, type SiteMode } from "../SiteModeToggle/SiteModeToggle.tsx";
import { AirspaceToggle } from "../AirspaceToggle/AirspaceToggle.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { WindArrow } from "../WindArrowField/index.ts";
import { computeSiteBounds } from "./mapBounds.ts";
import { MapLibreMap } from "./MapLibreMap.tsx";
import { MapMarker } from "./MapMarker.tsx";
import { MapModeToggle } from "./MapModeToggle.tsx";
import { buildStyleForMode, type MapMode } from "./mapStyles.ts";
import { useSiteForecasts } from "../../app/useSiteForecasts.ts";
import { useLiveData } from "../../app/useLiveData.ts";
import { useWindGrid } from "../../app/useWindGrid.ts";

const MARKER_SIZE = 48;
const SELECTED_MARKER_SIZE = 60;
const SURFACE_HEIGHT_M = 10;
const ARROW_SIZE = 39; // 1.5x the original 26px, per user feedback

// Forecast/wind-grid data is now published every ~5 minutes by
// scripts/collect-forecasts.ts (server-side), not fetched live per
// visitor - these thresholds flag when the publish cron itself seems
// to have stopped working (way beyond normal cadence jitter), not
// every visitor's exact page-load timing relative to the last run.
const FORECAST_FRESH_MINUTES = 15;
const FORECAST_STALE_MINUTES = 60;

/** Non-interactive - never intercepts clicks meant for site markers or the map itself. Takes the slider-indexed single value, not the whole point's hourly arrays. */
function buildWindArrowHtml(windDirectionDeg: number | null, windSpeedMs: number | null): string | null {
  if (windDirectionDeg === null || windSpeedMs === null) return null;
  return renderToStaticMarkup(
    <div style={{ pointerEvents: "none" }}>
      <WindArrow windDirectionDeg={windDirectionDeg} windSpeedMs={windSpeedMs} size={ARROW_SIZE} />
    </div>,
  );
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
 * Surface mode always reads the 10m series. Soaring mode interpolates
 * across the discrete model heights to the site's configured
 * soaring_height.agl_m (§7.2); a site with no configured height shows
 * unsupported (null data), never silently falling back to surface (§7.2,
 * Block 7 DoD).
 */
function forecastPointAt(
  forecast: SiteForecast | undefined,
  index: number,
  mode: HeightMode,
  soaringHeightAglM: number | null,
): ForecastPoint {
  const weatherKind = forecast?.weatherKind[index] ?? "unknown";

  if (!forecast || index < 0 || index >= forecast.hours.length) {
    return {
      windDirectionDeg: null,
      windSpeedMs: null,
      windGustMs: null,
      weatherKind,
      effectiveHeightM: null,
      heightSupported: mode === "surface",
    };
  }

  if (mode === "surface") {
    return {
      windDirectionDeg: forecast.heights[SURFACE_HEIGHT_M].windDirectionDeg[index] ?? null,
      windSpeedMs: forecast.heights[SURFACE_HEIGHT_M].windSpeedMs[index] ?? null,
      windGustMs: forecast.windGustMs[index] ?? null,
      weatherKind,
      effectiveHeightM: SURFACE_HEIGHT_M,
      heightSupported: true,
    };
  }

  if (soaringHeightAglM === null) {
    return {
      windDirectionDeg: null,
      windSpeedMs: null,
      windGustMs: null,
      weatherKind,
      effectiveHeightM: null,
      heightSupported: false,
    };
  }

  const samples = MODEL_HEIGHTS_M.map((h) => ({
    heightM: h,
    windDirectionDeg: forecast.heights[h].windDirectionDeg[index] ?? null,
    windSpeedMs: forecast.heights[h].windSpeedMs[index] ?? null,
  }));
  const interpolated = interpolateWindAtHeight(soaringHeightAglM, samples);
  return {
    windDirectionDeg: interpolated.windDirectionDeg,
    windSpeedMs: interpolated.windSpeedMs,
    windGustMs: null, // gust isn't modeled at height, only at surface
    weatherKind,
    effectiveHeightM: interpolated.effectiveHeightM,
    heightSupported: true,
  };
}

function buildRoseHtml(
  site: LocatedSite,
  selected: boolean,
  sample: EffectiveSample,
  weatherKind: SiteForecast["weatherKind"][number],
): { html: string; size: number } {
  const size = selected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
  const greenSectors = site.rose.green.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }));
  const orangeSectors = site.rose.orange.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }));
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
      greenSectors={greenSectors}
      orangeSectors={orangeSectors}
      windDirectionDeg={sample.windDirectionDeg}
      windSpeedMs={sample.windSpeedMs}
      state={state}
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
  const [heightMode, setHeightMode] = useState<HeightMode>("surface");
  const [mapMode, setMapMode] = useState<MapMode>("relief");
  const [siteMode, setSiteMode] = useState<SiteMode>("soaring");
  const [showAirspace, setShowAirspace] = useState(false);
  // Bounds/fit are computed from the full located set regardless of
  // siteMode, same "no map jump" principle as heightMode/mapMode -
  // switching to Winch never recenters the map just because that set is
  // currently empty (neither winch-brandstad nor winch-urasa has a
  // usable coordinate yet - see docs/SITE_DATA_AUDIT.md).
  const bounds = useMemo(() => computeSiteBounds(sites), [sites]);
  const visibleSites = useMemo(
    () => sites.filter((s) => (siteMode === "winch" ? s.type === "winch" : s.type !== "winch")),
    [sites, siteMode],
  );
  const mapStyle = useMemo(() => buildStyleForMode(mapMode), [mapMode]);
  // Scoped to visibleSites, not the full sites list, so a selection from
  // the other siteMode's marker set doesn't leave a stale sheet open
  // for a site no longer shown on the map.
  const selectedSite = visibleSites.find((s) => s.id === selectedId) ?? null;
  const { forecastsBySiteId, hours, generatedAt: forecastGeneratedAt } = useSiteForecasts(sites);
  const { data: liveData } = useLiveData();
  const { points: windGridPoints, generatedAt: gridGeneratedAt } = useWindGrid();
  const isNow = sliderIndex === 0;

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
    const point = forecastPointAt(forecastsBySiteId[site.id], sliderIndex, heightMode, site.soaring_height.agl_m);
    const liveEntry = liveData?.sites[site.id];
    // A surface anemometer never stands in for wind aloft (§7.2) - live
    // observations only apply in Surface mode.
    const liveSample: WindSample | null =
      heightMode === "surface" && liveEntry?.status === "ok" ? liveEntry.sample : null;
    const sample = selectEffectiveSample(isNow, liveSample, point, new Date(), freshMinutes, staleMinutes);
    const effectiveHeightM = sample.sourceKind === "observation" ? SURFACE_HEIGHT_M : point.effectiveHeightM;
    return { sample, weatherKind: point.weatherKind, effectiveHeightM, heightSupported: point.heightSupported };
  }

  const selectedResult = selectedSite ? effectiveSampleFor(selectedSite) : null;

  return (
    <div className="site-map-container" data-testid="site-map">
      <div className="top-controls">
        <MapModeToggle mode={mapMode} onChange={setMapMode} availableModes={["relief", "topo", "map"]} />
        <HeightModeToggle mode={heightMode} onChange={setHeightMode} />
        <SiteModeToggle mode={siteMode} onChange={setSiteMode} />
        <AirspaceToggle show={showAirspace} onChange={setShowAirspace} />
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
      <MapLibreMap
        style={mapStyle}
        bounds={maplibreBounds}
        // Bottom padding keeps fitted markers clear of the persistent
        // 112px time-slider bar (App.css's .time-slider height) so they
        // never land unclickable behind it - found via an E2E diagnostic
        // during the MapLibre port, not just a cosmetic choice.
        boundsPadding={{ top: 40, bottom: 152, left: 40, right: 40 }}
        maxZoom={12}
        showAirspace={showAirspace}
        className="site-map"
      >
        {(map) => (
          <>
            {windGridPoints.map((point, i) => {
              const html = buildWindArrowHtml(point.windDirectionDeg[sliderIndex] ?? null, point.windSpeedMs[sliderIndex] ?? null);
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
          heightMode={heightMode}
          effectiveHeightM={selectedResult.effectiveHeightM}
          heightSupported={selectedResult.heightSupported}
          selectedTimestamp={hours[sliderIndex] ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
      <TimeSlider hours={hours} selectedIndex={sliderIndex} onChange={setSliderIndex} />
    </div>
  );
}
