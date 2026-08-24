import type { ImageSource, Map as MapLibreGLMap } from "maplibre-gl";
import { WIND_PARTICLE_LAYER_ID } from "./windParticleLayer.ts";
import { SKYWAYS_LAYER_ID } from "./skywaysLayer.ts";
import { AIRSPACE_FILL_LAYER_ID, AIRSPACE_LINE_LAYER_ID } from "./airspaceLayer.ts";

export const RASP_SOURCE_ID = "rasp-wstar-source";
export const RASP_LAYER_ID = "rasp-wstar-layer";

// Checked in this exact priority order (nearest-desired-neighbor first),
// per the documented stack (roses > airspace > wind > RASP > basemap):
// wind is what should sit DIRECTLY above RASP when present; skyways is
// the next-best anchor when wind isn't (it's added unconditionally in
// MapLibreMap's "style.load" handler, so it's reliably present once the
// map has loaded); airspace last since it's the least likely to exist at
// the moment RASP gets toggled (user-toggled, off by default).
const LAYERS_ABOVE_RASP_IN_PRIORITY = [WIND_PARTICLE_LAYER_ID, SKYWAYS_LAYER_ID, AIRSPACE_FILL_LAYER_ID, AIRSPACE_LINE_LAYER_ID];

/**
 * Real bug found (2026-08-24): plain `map.addLayer(layer)` with no
 * `beforeId` always appends to the TOP of the current stack. On a fresh
 * page load, the "style.load" handler happens to add RASP before wind/
 * airspace/skyways, so the stack comes out correct by coincidence of add
 * order. But toggling RASP on interactively - after wind is already
 * present - appended it ON TOP of the wind particle layer instead,
 * visually burying the wind particles under RASP's semi-transparent
 * raster ("wind disappears when enabling RASP").
 *
 * Deliberately uses `map.getLayer(id)` per candidate, NOT
 * `map.getStyle().layers` - the wind particle layer is a CUSTOM
 * (WebGL) MapLibre layer, and `getStyle()` only serializes the
 * standard style-spec layer list, which excludes custom layers
 * entirely (confirmed live: `getStyle().layers` never contains
 * "wind-particles" even while `getLayer("wind-particles")` correctly
 * finds it). An earlier version of this function used `getStyle()` and
 * only "worked" by transitively relying on skyways always sitting
 * below wind - correct today, but not actually checking wind at all.
 */
function _findLowestExistingLayerId(map: MapLibreGLMap): string | undefined {
  for (const id of LAYERS_ABOVE_RASP_IN_PRIORITY) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

// Deliberately semi-transparent - the map underneath must stay visible
// (§ RASP visual language: "transparent color overlay; map remains
// visible beneath"), and low enough that it doesn't compete with the
// wind particle layer or site roses painted above it.
const RASP_OPACITY = 0.7;

type Bbox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

function coordinatesFromBbox([minLon, minLat, maxLon, maxLat]: Bbox): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  // MapLibre's ImageSource expects corners in this specific order:
  // top-left, top-right, bottom-right, bottom-left.
  return [
    [minLon, maxLat],
    [maxLon, maxLat],
    [maxLon, minLat],
    [minLon, minLat],
  ];
}

/**
 * RASP W* overlay (Milestone: FlyWeather-Soaring integration) - a single
 * georeferenced raster image per forecast valid time, swapped via
 * updateRaspImage() as the time slider moves rather than removed/re-added,
 * per the "smooth transition, don't reset unnecessarily" convention this
 * app already uses for the wind particle layer.
 *
 * Layer order: added in MapLibreMap's "style.load" handler BEFORE the
 * wind particle layer, Skyways, and Airspace, so it paints as the
 * bottom-most overlay directly above the basemap - roses > airspace >
 * wind > RASP > basemap, per the target visual stack.
 *
 * Idempotent - matches airspaceLayer.ts/skywaysLayer.ts's own pattern.
 */
export function addRaspLayer(map: MapLibreGLMap, imageUrl: string, bbox: Bbox): void {
  if (map.getSource(RASP_SOURCE_ID)) return;
  map.addSource(RASP_SOURCE_ID, {
    type: "image",
    url: imageUrl,
    coordinates: coordinatesFromBbox(bbox),
  });
  map.addLayer(
    {
      id: RASP_LAYER_ID,
      type: "raster",
      source: RASP_SOURCE_ID,
      paint: {
        "raster-opacity": RASP_OPACITY,
        // No fade animation - a fade would visually blend the OLD hour's
        // raster into the NEW one for a moment, which could read as a
        // real (wrong) transitional forecast value rather than an instant
        // switch between two discrete hours' data.
        "raster-fade-duration": 0,
      },
    },
    _findLowestExistingLayerId(map),
  );
}

/** Swaps the currently-shown raster for a different forecast hour, without touching the layer/source (no removal, no flicker, no lost React-independent state). No-op if the layer isn't currently added. */
export function updateRaspImage(map: MapLibreGLMap, imageUrl: string): void {
  const source = map.getSource(RASP_SOURCE_ID) as ImageSource | undefined;
  source?.updateImage({ url: imageUrl });
}

export function removeRaspLayer(map: MapLibreGLMap): void {
  if (map.getLayer(RASP_LAYER_ID)) map.removeLayer(RASP_LAYER_ID);
  if (map.getSource(RASP_SOURCE_ID)) map.removeSource(RASP_SOURCE_ID);
}
