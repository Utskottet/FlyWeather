import { addProtocol } from "maplibre-gl";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import mlcontour from "maplibre-contour";

const OPENFREEMAP_VECTOR_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_ATTRIBUTION =
  '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/">OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const MAPTERHORN_DEM_TILES = ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"];
const MAPTERHORN_ATTRIBUTION = '&copy; <a href="https://mapterhorn.com/attribution">Mapterhorn</a>';

// Same water filter OpenFreeMap's own "positron" style uses (excludes
// tunnel/brunnel water so underground sections don't paint as lakes).
const WATER_FILTER: FilterSpecification = [
  "all",
  ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
  ["!=", ["get", "brunnel"], "tunnel"],
];

const openMapTilesSource = {
  type: "vector" as const,
  url: OPENFREEMAP_VECTOR_URL,
  attribution: OPENFREEMAP_ATTRIBUTION,
};

const mapterhornDemSource = {
  type: "raster-dem" as const,
  tiles: MAPTERHORN_DEM_TILES,
  tileSize: 512,
  encoding: "terrarium" as const,
  attribution: MAPTERHORN_ATTRIBUTION,
};

// maplibre-contour computes contour lines client-side from the same
// Mapterhorn DEM tiles, exposed to MapLibre as a custom-protocol vector
// source. Registered once at module load (setupMaplibre wires up
// addProtocol) rather than per style-build, since re-registering the
// same protocol id on every mode switch would be wasted work.
const contourDemSource = new mlcontour.DemSource({
  url: MAPTERHORN_DEM_TILES[0],
  encoding: "terrarium",
  maxzoom: 14,
  worker: true,
});
contourDemSource.setupMaplibre({ addProtocol });

/**
 * The land base colour, and the halo colour for anything drawn over it.
 * Deliberately near-neutral: an earlier #d9d4c6 was darker but still
 * warm, and warmth at this lightness reads as yellow rather than as sand.
 * One constant because the two must agree: a text halo is there to punch a
 * hole in the background behind the glyph, so if it is lighter than the
 * land it stops reading as a hole and starts reading as a glow.
 */
const LAND_COLOR = "#c1d3da";

/**
 * Hillshade tones, derived from LAND_COLOR by scaling it rather than
 * picked separately - each is the same hue at 25% and 48% lightness. That
 * is what keeps the relief reading as shadow ON this land instead of as a
 * second colour laid over it, and it is why the previous palette looked
 * yellow: its browns had no relationship to the base at all.
 */
const LAND_SHADOW_COLOR = "#303536";
const LAND_ACCENT_COLOR = "#5d6569";

const CONTOUR_SOURCE_ID = "contour-source";
const CONTOUR_LAYER = "contours";

/**
 * RELIEF (default mode, §-per-user-spec): terrain-first, deliberately
 * stripped of roads/labels/POIs/buildings - blue sea, pale land, a
 * strong hillshade. Exaggerated rather than cartographically subtle so
 * Skåne's modest terrain actually reads at a glance; push these numbers
 * further rather than toward realism if it still looks too flat.
 */
export function buildReliefStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      openmaptiles: openMapTilesSource,
      "mapterhorn-dem": mapterhornDemSource,
    },
    layers: [
      // Land base. Darkened from the original #f2efe6 per user feedback
      // ("land needs to be a little darker") while the hillshade above is
      // left alone - which INCREASES topographic contrast rather than
      // costing it, since the highlight stays pure white and now has
      // further to travel from the base. Any label halo that used to match
      // the old value is updated with it below; a halo brighter than its
      // own background reads as a glow.
      { id: "background", type: "background", paint: { "background-color": LAND_COLOR } },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        filter: WATER_FILTER,
        // Gray per user feedback (was a light blue, #a9cfe3) - applies to
        // both RELIEF and TOPO (TOPO spreads RELIEF's layers, see below).
        paint: { "fill-color": "#8c94a1" },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "mapterhorn-dem",
        paint: {
          "hillshade-exaggeration": 1,
          "hillshade-illumination-direction": 315,
          // Derived from LAND_COLOR, not chosen independently - see there.
          // The hillshade covers every slope, so its shadow tone tints the
          // whole landmass; a shadow unrelated to the base is exactly what
          // made the old palette read as yellow.
          "hillshade-shadow-color": LAND_SHADOW_COLOR,
          // Still pure white rather than a tinted highlight: it is the far
          // end of the contrast range, and the brief has been consistent
          // that the topography has to keep reading.
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": LAND_ACCENT_COLOR,
        },
      },
    ],
  };
}

/**
 * TOPO: RELIEF's hillshade stays present and visually dominant (per
 * user spec, this is not a step toward a street map) with contour
 * lines, major roads, town names, and rivers/lakes layered on top for
 * navigational context. Thresholds start at 5m minor / 25m major per
 * the user's explicit starting point, coarsening at lower zooms so
 * Skåne's flat terrain doesn't produce an illegible line tangle when
 * zoomed out.
 */
export function buildTopoStyle(): StyleSpecification {
  const relief = buildReliefStyle();
  return {
    ...relief,
    sources: {
      ...relief.sources,
      [CONTOUR_SOURCE_ID]: {
        type: "vector",
        tiles: [
          contourDemSource.contourProtocolUrl({
            multiplier: 1,
            thresholds: {
              9: [50, 200],
              11: [25, 100],
              13: [5, 25],
            },
            elevationKey: "ele",
            levelKey: "level",
            contourLayer: CONTOUR_LAYER,
          }),
        ],
        maxzoom: 14,
      },
    },
    layers: [
      ...relief.layers,
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: { "line-color": "#7fb3d5", "line-width": 1 },
      },
      {
        id: "contours-minor",
        type: "line",
        source: CONTOUR_SOURCE_ID,
        "source-layer": CONTOUR_LAYER,
        filter: ["==", ["get", "level"], 0],
        paint: { "line-color": "#7e878b", "line-width": 0.5, "line-opacity": 0.6 },
      },
      {
        id: "contours-major",
        type: "line",
        source: CONTOUR_SOURCE_ID,
        "source-layer": CONTOUR_LAYER,
        filter: ["==", ["get", "level"], 1],
        paint: { "line-color": LAND_ACCENT_COLOR, "line-width": 1, "line-opacity": 0.8 },
      },
      {
        id: "contour-labels",
        type: "symbol",
        source: CONTOUR_SOURCE_ID,
        "source-layer": CONTOUR_LAYER,
        filter: ["==", ["get", "level"], 1],
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
          "text-size": 10,
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": LAND_ACCENT_COLOR, "text-halo-color": LAND_COLOR, "text-halo-width": 1 },
      },
      {
        id: "roads-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        paint: { "line-color": "#c9a876", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2.5] },
      },
      {
        id: "place-labels",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 14],
        },
        paint: { "text-color": "#2e3336", "text-halo-color": LAND_COLOR, "text-halo-width": 1.2 },
      },
    ],
  };
}

/**
 * ROADS off/on (§ FlyWeather Interaction Model) - the old 3rd "Map" mode
 * (a plain OpenFreeMap-hosted orientation style, no terrain) is removed;
 * ROADS is literally today's Relief/Topo choice, since buildTopoStyle()
 * already is "Relief + roads/contours/labels" layered on top.
 */
export function buildStyleForRoads(showRoads: boolean): StyleSpecification {
  return showRoads ? buildTopoStyle() : buildReliefStyle();
}
