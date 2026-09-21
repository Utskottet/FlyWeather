import { useEffect, useRef, useState } from "react";
import { COMPACT_MAX_WIDTH_PX } from "../../app/useIsCompact.ts";
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
  /**
   * Called with the map's zoom whenever it changes, so a caller can size
   * things that should not be one fixed size at every scale.
   *
   * Fires continuously through a pinch or a wheel, which is what makes
   * the result smooth; callers are expected to quantise whatever they
   * derive from it rather than re-render on every fractional change.
   */
  onZoomChange?: (zoom: number) => void;
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
  onZoomChange,
  children,
}: MapLibreMapProps) {
  // Held in a ref so the map is created once and never torn down just
  // because a caller passed a fresh closure - the whole "no map jump"
  // property depends on this component not recreating the map.
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
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

    // MapLibre fires queued style events even after `remove()` has torn
    // the style down, and every layer-adding call below then throws
    // "Style is not done loading", which takes the whole React tree with
    // it. That happens whenever this component is mounted, unmounted and
    // mounted again faster than the style loads - React's StrictMode
    // double-mount in development does exactly that, and any future
    // remount would too. The flag makes the handlers no-ops once this
    // particular instance is gone.
    let disposed = false;

    const instance = new MapLibreGLMap({
      container: containerRef.current,
      style: styleRef.current,
      bounds,
      fitBoundsOptions: { padding: boundsPadding, maxZoom },
      attributionControl: { compact: true },
      // The map is never tilted and never rotated. North is up, always.
      //
      // This is not a default being accepted - every route into a tilted or
      // turned map is closed deliberately, because there are several and
      // disabling one leaves the others: ctrl/right-drag on desktop, a
      // two-finger twist or drag on a phone, and the keyboard arrows. A
      // pilot reading wind directions off a rose needs the compass fixed;
      // a map that has quietly rotated 20 degrees makes every bearing on
      // screen a lie.
      //
      // maxPitch/maxBearing are the backstop: even a programmatic easeTo
      // or a gesture that slips past a handler cannot tilt or turn it.
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      rollEnabled: false,
    });
    // Rotation via the two-finger touch gesture is part of touchZoomRotate
    // rather than its own option, so it has to be switched off separately -
    // otherwise pinch-zooming on a phone still turns the map.
    instance.touchZoomRotate.disableRotation();
    // The keyboard handler rotates with the arrow keys by default.
    instance.keyboard.disableRotation();
    // Top right: the app's own control column (Ridge/Winch + Map layers)
    // owns the top left corner (§ Startvind UX Direction), and two control
    // stacks in one corner is exactly the pile this milestone removed.
    // Zoom buttons on a pointer device only. On a touch screen pinch does
    // the same job, so they are two permanent buttons occupying the corner
    // the layer switches now need - redundancy the small screen cannot
    // afford. Rotation is already disabled, so there is no compass either
    // way.
    if (!window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH_PX}px)`).matches) {
      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    }
    setMap(instance);

    window.__flyweatherMap = instance;
    window.__flyweatherMapLoaded = false;
    instance.once("load", () => {
      if (disposed) return;
      window.__flyweatherMapLoaded = true;
    });
    // "style.load" fires on the initial load AND after every setStyle()
    // call (mode switch) - setStyle() clears sources/layers not part of
    // the new spec, so this must re-run every time to stay always-on
    // across RELIEF/TOPO/MAP per Block 18's "no toggle" requirement.
    instance.on("zoom", () => onZoomChangeRef.current?.(instance.getZoom()));

    instance.on("style.load", () => {
      if (disposed) return;
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
      disposed = true;
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
  //
  // The style the map was CREATED with is skipped: re-applying it the
  // moment the instance appears is not just wasted work, it restarts the
  // style load while the first one is still in flight, and the pending
  // "style.load" from that first load then runs against a style that is
  // no longer loaded - every layer-adding call in the handler throws
  // "Style is not done loading" and the whole React tree goes with it.
  // (Seen for real once a layout effect elsewhere in the app shifted
  // mount timing by a frame - the bug was always there, waiting.)
  const appliedStyleRef = useRef(style);
  useEffect(() => {
    if (!map) return;
    if (appliedStyleRef.current === style) return;
    appliedStyleRef.current = style;
    map.setStyle(style);
  }, [map, style]);

  // Toggling airspace while the current style is already loaded (the
  // common case - no mode switch involved) adds/removes it directly;
  // surviving an actual mode switch is handled by the "style.load"
  // listener above via showAirspaceRef.
  //
  // The isStyleLoaded() guard here and in the wind effect below is not
  // belt-and-braces: `map` becomes non-null the moment the instance is
  // constructed, which is well before its style has loaded, so whether
  // this effect ran early enough to throw "Style is not done loading"
  // was pure timing luck - and the throw takes the entire React tree
  // down, not just the layer. Skipping is safe because the "style.load"
  // listener adds both layers from the same refs as soon as the style is
  // ready.
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
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
    if (!map || !map.isStyleLoaded()) return;
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
