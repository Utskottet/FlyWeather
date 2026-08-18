import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocatedSite } from "../../domain/sites.ts";
import { WindRose } from "../WindRose/index.ts";
import { SiteSheet } from "../SiteSheet/SiteSheet.tsx";
import { computeSiteBounds } from "./mapBounds.ts";

const MARKER_SIZE = 48;
const SELECTED_MARKER_SIZE = 60;

function buildRoseIcon(site: LocatedSite, selected: boolean): L.DivIcon {
  const size = selected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
  // No live/forecast data exists yet (that lands in Block 5/6) - state
  // stays honestly "gray" rather than inventing wind numbers, per
  // AGENTS.md's rule against fake production weather data.
  const html = renderToStaticMarkup(
    <WindRose
      size={size}
      greenSectors={site.rose.green.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }))}
      orangeSectors={site.rose.orange.map((s) => ({ fromDeg: s.from_deg, toDeg: s.to_deg }))}
      windDirectionDeg={null}
      windSpeedMs={null}
      state="gray"
    />,
  );
  return L.divIcon({
    html,
    className: "rose-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export interface SiteMapProps {
  sites: LocatedSite[];
}

export function SiteMap({ sites }: SiteMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bounds = useMemo(() => computeSiteBounds(sites), [sites]);
  const selectedSite = sites.find((s) => s.id === selectedId) ?? null;

  if (!bounds) {
    return <div className="app-status">No sites with known coordinates yet.</div>;
  }

  const leafletBounds: LatLngBoundsExpression = [
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  ];

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
        {sites.map((site) => (
          <Marker
            key={site.id}
            position={[site.coordinates.lat, site.coordinates.lon]}
            icon={buildRoseIcon(site, site.id === selectedId)}
            zIndexOffset={site.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => setSelectedId(site.id) }}
          />
        ))}
      </MapContainer>
      {selectedSite && <SiteSheet site={selectedSite} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
