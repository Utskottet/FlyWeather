import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreGLMap,
  NavigationControl,
  setWorkerUrl,
  type LngLatBoundsLike,
  type PaddingOptions,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addSkywaysLayer } from "./skywaysLayer.ts";
// MapLibre resolves its worker script's URL relative to its own bundled
// module's import.meta.url at runtime, which breaks once Rollup inlines
// maplibre-gl into our own bundle (the worker file itself never gets
// copied into dist/, so the computed URL 404s - confirmed on the live
// GitHub Pages deploy: canvas rendered with markers but no tiles/
// hillshade at all). The worker script also does its own static
// relative import of a sibling maplibre-gl-shared.mjs, so a plain
// Vite `?url` copy of just the worker file isn't enough - that sibling
// import still 404s under a hashed filename. Both files are copied
// verbatim into public/vendor/maplibre-gl/ by
// scripts/copy-maplibre-worker.ts (run before dev/build) so the
// worker's relative import keeps resolving, and we point MapLibre at
// that fixed path instead.
setWorkerUrl(`${import.meta.env.BASE_URL}vendor/maplibre-gl/maplibre-gl-worker.mjs`);

export interface MapLibreMapProps {
  /** A full inline spec (RELIEF/TOPO, built locally) or a style URL string (MAP, OpenFreeMap-hosted) - MapLibre accepts both natively. */
  style: StyleSpecification | string;
  /** [[minLng, minLat], [maxLng, maxLat]] - note lng/lat order, opposite of Leaflet's lat/lng. */
  bounds: LngLatBoundsLike;
  /**
   * Per-side padding so fitBounds keeps markers out from behind
   * persistent UI chrome (the time slider bar, top controls) - a plain
   * number here would let a marker's fitted position land underneath
   * that chrome, making it unclickable for real users, not just a test
   * artifact (found via an E2E diagnostic during the MapLibre port).
   */
  boundsPadding?: number | PaddingOptions;
  maxZoom?: number;
  className?: string;
  children?: (map: MapLibreGLMap | null) => React.ReactNode;
}

/**
 * Thin lifecycle wrapper: creates the map once on mount (bounds/fit only
 * apply at that point, same as the previous Leaflet setup, which is what
 * gives "no map jump" when time slider / height mode / map mode change -
 * this component never recreates the map for those). Exposes the live
 * map instance to children via a render-prop so markers can attach to it.
 */
export function MapLibreMap({ style, bounds, boundsPadding = 40, maxZoom = 12, className, children }: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreGLMap | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new MapLibreGLMap({
      container: containerRef.current,
      style: styleRef.current,
      bounds,
      fitBoundsOptions: { padding: boundsPadding, maxZoom },
      attributionControl: { compact: true },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), "top-left");
    setMap(instance);

    window.__flyweatherMap = instance;
    window.__flyweatherMapLoaded = false;
    instance.once("load", () => {
      window.__flyweatherMapLoaded = true;
    });
    // "style.load" fires on the initial load AND after every setStyle()
    // call (mode switch) - setStyle() clears sources/layers not part of
    // the new spec, so this must re-run every time to stay always-on
    // across RELIEF/TOPO/MAP per Block 18's "no toggle" requirement.
    instance.on("style.load", () => addSkywaysLayer(instance));

    return () => {
      instance.remove();
      setMap(null);
      window.__flyweatherMap = undefined;
      window.__flyweatherMapLoaded = undefined;
    };
    // bounds/maxZoom/boundsPadding intentionally only apply at creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swapping the style (map mode change) preserves the existing map
  // instance's center/zoom/bearing - setStyle() doesn't reset the view.
  useEffect(() => {
    map?.setStyle(style);
  }, [map, style]);

  return (
    <div ref={containerRef} className={className} data-testid="site-map-canvas">
      {children?.(map)}
    </div>
  );
}
