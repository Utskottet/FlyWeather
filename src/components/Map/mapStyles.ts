import { addProtocol } from "maplibre-gl";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import mlcontour from "maplibre-contour";

export type MapMode = "relief" | "topo" | "map";

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
      { id: "background", type: "background", paint: { "background-color": "#f2efe6" } },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        filter: WATER_FILTER,
        // Gray per user feedback (was a light blue, #a9cfe3) - applies to
        // RELIEF and TOPO (TOPO spreads RELIEF's layers, see below). MAP
        // mode's sea color isn't ours to change - it's OpenFreeMap's
        // externally hosted positron style (Block 14c), not an inline
        // spec built here.
        paint: { "fill-color": "#8c94a1" },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "mapterhorn-dem",
        paint: {
          "hillshade-exaggeration": 1,
          "hillshade-illumination-direction": 315,
          "hillshade-shadow-color": "#39352c",
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": "#6b6250",
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
        paint: { "line-color": "#8a7f66", "line-width": 0.5, "line-opacity": 0.6 },
      },
      {
        id: "contours-major",
        type: "line",
        source: CONTOUR_SOURCE_ID,
        "source-layer": CONTOUR_LAYER,
        filter: ["==", ["get", "level"], 1],
        paint: { "line-color": "#6b5f45", "line-width": 1, "line-opacity": 0.8 },
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
        paint: { "text-color": "#6b5f45", "text-halo-color": "#f2efe6", "text-halo-width": 1 },
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
        paint: { "text-color": "#3b352a", "text-halo-color": "#f2efe6", "text-halo-width": 1.2 },
      },
    ],
  };
}

// OpenFreeMap's own hosted Positron-equivalent style: roads, buildings,
// water, boundaries, place labels at every zoom, no hillshade at all -
// exactly the "conventional clean orientation map... hillshade reduced
// or removed" the user asked for. Pointing at it directly (MapLibre
// accepts a style URL as well as an inline spec) rather than hand-
// copying its ~55 layers into this file, since OpenFreeMap maintains and
// updates it themselves.
const OPENFREEMAP_POSITRON_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** MAP: conventional orientation map, no terrain layer at all (per spec). */
export function buildMapModeStyle(): string {
  return OPENFREEMAP_POSITRON_STYLE_URL;
}

export function buildStyleForMode(mode: MapMode): StyleSpecification | string {
  switch (mode) {
    case "relief":
      return buildReliefStyle();
    case "topo":
      return buildTopoStyle();
    case "map":
      return buildMapModeStyle();
  }
}
