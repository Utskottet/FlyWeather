import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast, WindSample } from "../../domain/types.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { selectEffectiveSample, type EffectiveSample } from "../../domain/effectiveSample.ts";
import { interpolateWindAtHeight } from "../../domain/heightInterpolation.ts";
import { WindRose } from "../WindRose/index.ts";
import { WeatherGlyph } from "../WeatherGlyph/index.ts";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { HeightModeToggle, type HeightMode } from "../HeightModeToggle/HeightModeToggle.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { WindArrow } from "../WindArrowField/index.ts";
import { computeSiteBounds } from "./mapBounds.ts";
import { useSiteForecasts } from "../../app/useSiteForecasts.ts";
import { useLiveData } from "../../app/useLiveData.ts";
import { useWindGrid } from "../../app/useWindGrid.ts";
import type { GridWindPoint } from "../../providers/forecast/openMeteoGridProvider.ts";

const MARKER_SIZE = 48;
const SELECTED_MARKER_SIZE = 60;
const SURFACE_HEIGHT_M = 10;
const ARROW_SIZE = 26;

/** Non-interactive - never intercepts clicks meant for site markers or the map itself. */
function buildWindArrowIcon(point: GridWindPoint): L.DivIcon | null {
  if (point.windDirectionDeg === null || point.windSpeedMs === null) return null;
  const html = renderToStaticMarkup(
    <div style={{ pointerEvents: "none" }}>
      <WindArrow windDirectionDeg={point.windDirectionDeg} windSpeedMs={point.windSpeedMs} size={ARROW_SIZE} />
    </div>,
  );
  return L.divIcon({
    html,
    className: "wind-arrow-icon",
    iconSize: [ARROW_SIZE, ARROW_SIZE],
    iconAnchor: [ARROW_SIZE / 2, ARROW_SIZE / 2],
  });
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

function buildRoseIcon(
  site: LocatedSite,
  selected: boolean,
  sample: EffectiveSample,
  weatherKind: SiteForecast["weatherKind"][number],
): L.DivIcon {
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <WindRose
        size={size}
        greenSectors={greenSectors}
        orangeSectors={orangeSectors}
        windDirectionDeg={sample.windDirectionDeg}
        windSpeedMs={sample.windSpeedMs}
        state={state}
      />
      <div style={{ marginTop: -6 }}>
        <WeatherGlyph kind={weatherKind} size={16} />
      </div>
    </div>,
  );
  return L.divIcon({
    html,
    className: "rose-marker-icon",
    iconSize: [size, size + 16],
    iconAnchor: [size / 2, size / 2],
  });
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
  const bounds = useMemo(() => computeSiteBounds(sites), [sites]);
  const selectedSite = sites.find((s) => s.id === selectedId) ?? null;
  const { forecastsBySiteId, hours } = useSiteForecasts(sites);
  const { data: liveData } = useLiveData();
  const { points: windGridPoints } = useWindGrid(bounds);
  const isNow = sliderIndex === 0;

  if (!bounds) {
    return <div className="app-status">No sites with known coordinates yet.</div>;
  }

  const leafletBounds: LatLngBoundsExpression = [
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
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
        <HeightModeToggle mode={heightMode} onChange={setHeightMode} />
      </div>
      <MapContainer
        bounds={leafletBounds}
        boundsOptions={{ padding: [40, 40], maxZoom: 12 }}
        className="site-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {windGridPoints.map((point, i) => {
          const icon = buildWindArrowIcon(point);
          if (!icon) return null;
          return (
            <Marker
              key={`wind-arrow-${i}`}
              position={[point.lat, point.lon]}
              icon={icon}
              interactive={false}
              zIndexOffset={-10000}
            />
          );
        })}
        {sites.map((site) => {
          const { sample, weatherKind } = effectiveSampleFor(site);
          return (
            <Marker
              key={site.id}
              position={[site.coordinates.lat, site.coordinates.lon]}
              icon={buildRoseIcon(site, site.id === selectedId, sample, weatherKind)}
              zIndexOffset={site.id === selectedId ? 1000 : 0}
              eventHandlers={{ click: () => setSelectedId(site.id) }}
            />
          );
        })}
      </MapContainer>
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
