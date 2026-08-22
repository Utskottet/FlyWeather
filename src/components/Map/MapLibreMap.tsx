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
import { addAirspaceLayer, removeAirspaceLayer } from "./airspaceLayer.ts";
import { addWindParticleLayer, removeWindParticleLayer, updateWindParticleLayer } from "./windParticleLayer.ts";
import { addRaspLayer, RASP_SOURCE_ID, removeRaspLayer, updateRaspImage } from "./raspLayer.ts";
import type { WindFieldGrid } from "../../domain/windField.ts";

export interface RaspOverlay {
  imageUrl: string;
  bbox: [number, number, number, number];
}

const AIRSPACE_DATA_URL = `${import.meta.env.BASE_URL}static/airspaces.json`;
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
  /** User-toggled (Block 17), off by default - unlike Skyways this fetches a ~700KB file, so it's only added when actually shown. */
  showAirspace?: boolean;
  /** Current slider-indexed wind vector field for the animated particle layer - null while loading. Updating this does not recreate the layer (smooth transition, per the animated-wind-field spec). */
  windGrid?: WindFieldGrid | null;
  /** false when prefers-reduced-motion is on - the animated layer is not added at all in that case (caller renders a static fallback instead). */
  windMotionEnabled?: boolean;
  /** null covers BOTH "toggled off" and "no product available for the current forecast hour" - either way, nothing is shown. The caller (SiteMap) is responsible for surfacing an "unavailable" notice in the latter case; this component only knows whether there's something to paint. */
  raspOverlay?: RaspOverlay | null;
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
export function MapLibreMap({
  style,
  bounds,
  boundsPadding = 40,
  maxZoom = 12,
  showAirspace = false,
  windGrid = null,
  windMotionEnabled = true,
  raspOverlay = null,
  className,
  children,
}: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreGLMap | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  // "style.load" re-fires after every setStyle() (mode switch), which
  // wipes all custom sources/layers - this ref lets that handler know
  // whether to re-add airspace without needing to recreate the listener
  // itself every time the showAirspace prop changes.
  const showAirspaceRef = useRef(showAirspace);
  showAirspaceRef.current = showAirspace;
  // Same "style.load" survival problem as airspace/skyways - a custom
  // WebGL layer's onRemove runs on every setStyle() too, so it must be
  // fully recreated (new GL resources) on each style load, then
  // immediately re-supplied with whatever wind data is current via
  // these refs rather than stale data from whenever the effect closure
  // was created.
  const windGridRef = useRef(windGrid);
  windGridRef.current = windGrid;
  const windMotionEnabledRef = useRef(windMotionEnabled);
  windMotionEnabledRef.current = windMotionEnabled;
  const raspOverlayRef = useRef(raspOverlay);
  raspOverlayRef.current = raspOverlay;

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
    instance.on("style.load", () => {
      // RASP added first so it paints as the bottom-most overlay, directly
      // above the basemap - roses > airspace > wind > RASP > basemap, per
      // the target visual stack (a transparency layer sitting under the
      // wind particles and airspace lines/labels reads better than one
      // painted on top of them).
      if (raspOverlayRef.current) addRaspLayer(instance, raspOverlayRef.current.imageUrl, raspOverlayRef.current.bbox);
      addSkywaysLayer(instance);
      if (showAirspaceRef.current) addAirspaceLayer(instance, AIRSPACE_DATA_URL);
      if (windMotionEnabledRef.current) addWindParticleLayer(instance, windGridRef.current);
    });

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

  // Toggling airspace while the current style is already loaded (the
  // common case - no mode switch involved) adds/removes it directly;
  // surviving an actual mode switch is handled by the "style.load"
  // listener above via showAirspaceRef.
  useEffect(() => {
    if (!map) return;
    if (showAirspace) {
      addAirspaceLayer(map, AIRSPACE_DATA_URL);
    } else {
      removeAirspaceLayer(map);
    }
  }, [map, showAirspace]);

  // Adds/removes the animated layer when reduced-motion changes mid-
  // session (the OS setting can flip while the tab is open) - surviving
  // an actual style/mode switch is handled by the "style.load" listener
  // above via windMotionEnabledRef.
  useEffect(() => {
    if (!map) return;
    if (windMotionEnabled) {
      addWindParticleLayer(map, windGridRef.current);
    } else {
      removeWindParticleLayer(map);
    }
  }, [map, windMotionEnabled]);

  // Slider moves (new grid data) update the existing layer's data in
  // place rather than recreating it - no interruption to particle
  // positions/ages, just a smooth redirect to the new vector field, per
  // the "do not reset animation unnecessarily" requirement.
  useEffect(() => {
    if (!map || !windMotionEnabled) return;
    updateWindParticleLayer(map, windGrid);
  }, [map, windGrid, windMotionEnabled]);

  // Covers toggling RASP on/off AND the time slider moving to an hour
  // with (or without) a matching product, uniformly: a non-null overlay
  // adds the layer if missing or swaps its image in place if already
  // present (no flicker, matches the wind layer's own "update, don't
  // recreate" convention); null removes it entirely - including the
  // case where the newly-selected hour simply has no matching product,
  // per "do not retain an old raster while labeling it as the selected
  // time". Surviving an actual style/mode switch is handled by the
  // "style.load" listener above via raspOverlayRef.
  useEffect(() => {
    if (!map) return;
    if (raspOverlay) {
      if (map.getSource(RASP_SOURCE_ID)) {
        updateRaspImage(map, raspOverlay.imageUrl);
      } else {
        addRaspLayer(map, raspOverlay.imageUrl, raspOverlay.bbox);
      }
    } else {
      removeRaspLayer(map);
    }
  }, [map, raspOverlay]);

  return (
    <div ref={containerRef} className={className} data-testid="site-map-canvas">
      {children?.(map)}
    </div>
  );
}
