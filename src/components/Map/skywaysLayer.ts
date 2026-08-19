import type { Map as MapLibreGLMap } from "maplibre-gl";

export const SKYWAYS_SOURCE_ID = "skyways-source";
export const SKYWAYS_LAYER_ID = "skyways-layer";

const SKYWAYS_ATTRIBUTION =
  '&copy; <a href="https://thermal.kk7.ch">thermal.kk7.ch</a> ' +
  '<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>';

/**
 * Always-on Skyways thermal/soaring-route overlay (Block 18, per the
 * user's explicit "no toggle" instruction). Source: thermal.kk7.ch,
 * traced from flyxc.app's own code - see docs/DATA_SOURCE_AUDIT.md's
 * Block 16 findings. `src=<hostname>` is the maintainer's own traffic-
 * tracking param, not an API key; no auth required.
 *
 * Idempotent and safe to call after every style load/swap - MapLibre's
 * `setStyle()` clears all sources/layers not part of the new style
 * spec, so this must be re-added on every `style.load` event, not just
 * the first one, to stay "always on" across RELIEF/TOPO/MAP switches.
 */
export function addSkywaysLayer(map: MapLibreGLMap): void {
  if (map.getSource(SKYWAYS_SOURCE_ID)) return;
  map.addSource(SKYWAYS_SOURCE_ID, {
    type: "raster",
    tiles: [`https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png?src=${window.location.hostname}`],
    // kk7's tiles use the TMS Y-axis convention (Y=0 at the south),
    // not the standard XYZ/slippy-map convention (Y=0 at the north)
    // MapLibre assumes by default - confirmed by cross-referencing
    // flyxc's own Google Maps overlay code, which manually flips Y
    // itself, and by fetching a known-flying-hotspot tile both ways:
    // the un-flipped XYZ request returned a blank 68-byte PNG, the
    // TMS-flipped one returned real 90KB+ thermal-density imagery.
    // Omitting this silently renders an always-blank overlay - no
    // error, no console warning, just nothing visible, ever.
    scheme: "tms",
    tileSize: 256,
    minzoom: 0,
    maxzoom: 13,
    attribution: SKYWAYS_ATTRIBUTION,
  });
  map.addLayer({
    id: SKYWAYS_LAYER_ID,
    type: "raster",
    source: SKYWAYS_SOURCE_ID,
    paint: { "raster-opacity": 0.85 },
  });
}
