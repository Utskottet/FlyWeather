import type { FilterSpecification, StyleSpecification } from "maplibre-gl";

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
        paint: { "fill-color": "#a9cfe3" },
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
 * TOPO stub (Block 14b builds this out properly: contour lines, major
 * roads, place names). For 14a this is intentionally identical to
 * RELIEF so the mode selector has something non-broken to fall back to
 * if clicked, while staying visibly "not done yet" via the disabled
 * button state in HeightModeToggle's sibling, MapModeToggle.
 */
export function buildTopoStyle(): StyleSpecification {
  return buildReliefStyle();
}

/** MAP stub (Block 14c builds this out: full OpenFreeMap positron-style layers, reduced hillshade). */
export function buildMapModeStyle(): StyleSpecification {
  return buildReliefStyle();
}

export function buildStyleForMode(mode: MapMode): StyleSpecification {
  switch (mode) {
    case "relief":
      return buildReliefStyle();
    case "topo":
      return buildTopoStyle();
    case "map":
      return buildMapModeStyle();
  }
}
