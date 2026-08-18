import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocatedSite } from "../../domain/sites.ts";
import type { SiteForecast } from "../../domain/types.ts";
import { evaluateFlyability } from "../../domain/flyability.ts";
import { WindRose } from "../WindRose/index.ts";
import { WeatherGlyph } from "../WeatherGlyph/index.ts";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { computeSiteBounds } from "./mapBounds.ts";
import { useSiteForecasts } from "../../app/useSiteForecasts.ts";

const MARKER_SIZE = 48;
const SELECTED_MARKER_SIZE = 60;

interface WindSampleAtIndex {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  weatherKind: SiteForecast["weatherKind"][number] | "unknown";
}

function sampleAt(forecast: SiteForecast | undefined, index: number): WindSampleAtIndex {
  if (!forecast || index < 0 || index >= forecast.hours.length) {
    return { windDirectionDeg: null, windSpeedMs: null, windGustMs: null, weatherKind: "unknown" };
  }
  return {
    windDirectionDeg: forecast.windDirectionDeg[index] ?? null,
    windSpeedMs: forecast.windSpeedMs[index] ?? null,
    windGustMs: forecast.windGustMs[index] ?? null,
    weatherKind: forecast.weatherKind[index] ?? "unknown",
  };
}

function buildRoseIcon(site: LocatedSite, selected: boolean, sample: WindSampleAtIndex): L.DivIcon {
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
        <WeatherGlyph kind={sample.weatherKind === "unknown" ? "unknown" : sample.weatherKind} size={16} />
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
}

export function SiteMap({ sites }: SiteMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const bounds = useMemo(() => computeSiteBounds(sites), [sites]);
  const selectedSite = sites.find((s) => s.id === selectedId) ?? null;
  const { forecastsBySiteId, hours } = useSiteForecasts(sites);

  if (!bounds) {
    return <div className="app-status">No sites with known coordinates yet.</div>;
  }

  const leafletBounds: LatLngBoundsExpression = [
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  ];

  const selectedSample = selectedSite ? sampleAt(forecastsBySiteId[selectedSite.id], sliderIndex) : null;

  return (
    <div className="site-map-container" data-testid="site-map">
      <MapContainer
        bounds={leafletBounds}
        boundsOptions={{ padding: [40, 40], maxZoom: 12 }}
        className="site-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site) => {
          const sample = sampleAt(forecastsBySiteId[site.id], sliderIndex);
          return (
            <Marker
              key={site.id}
              position={[site.coordinates.lat, site.coordinates.lon]}
              icon={buildRoseIcon(site, site.id === selectedId, sample)}
              zIndexOffset={site.id === selectedId ? 1000 : 0}
              eventHandlers={{ click: () => setSelectedId(site.id) }}
            />
          );
        })}
      </MapContainer>
      {selectedSite && selectedSample && (
        <SiteSheet
          site={selectedSite}
          sample={selectedSample}
          selectedTimestamp={hours[sliderIndex] ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
      <TimeSlider hours={hours} selectedIndex={sliderIndex} onChange={setSliderIndex} />
    </div>
  );
}
