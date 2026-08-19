import { useEffect, useRef } from "react";
import { Map as MapLibreGLMap, Marker } from "maplibre-gl";

export interface MapMarkerProps {
  map: MapLibreGLMap | null;
  lng: number;
  lat: number;
  html: string;
  className?: string;
  zIndex?: number;
  interactive?: boolean;
  onClick?: () => void;
}

/** Imperatively manages one maplibre-gl Marker - mirrors the previous Leaflet divIcon pattern (an HTML string per marker). */
export function MapMarker({ map, lng, lat, html, className, zIndex, interactive = true, onClick }: MapMarkerProps) {
  const markerRef = useRef<Marker | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!map) return;

    const el = document.createElement("div");
    if (className) el.className = className;
    if (!interactive) {
      el.style.pointerEvents = "none";
    } else {
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClickRef.current?.();
      });
    }
    elRef.current = el;

    const marker = new Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // lng/lat/interactive/className changes are handled by the effects
    // below without tearing down and recreating the marker
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (elRef.current) elRef.current.innerHTML = html;
  }, [html]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  useEffect(() => {
    if (elRef.current) elRef.current.style.zIndex = zIndex !== undefined ? String(zIndex) : "";
  }, [zIndex]);

  return null;
}
