import type { ImageSource, Map as MapLibreGLMap } from "maplibre-gl";

export const RASP_SOURCE_ID = "rasp-wstar-source";
export const RASP_LAYER_ID = "rasp-wstar-layer";

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
  map.addLayer({
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
  });
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
