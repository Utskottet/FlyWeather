import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AIRSPACE_TYPE_LABELS,
  ICAO_CLASS_LABELS,
  formatAltitudeLimit,
  categorizeAirspaceType,
} from "../src/domain/airspaceTypes.ts";

// Refreshed on a slow (weekly) schedule by .github/workflows/
// airspace-refresh.yml, not on every build like public/generated/*.json
// - airspace boundaries change rarely, and OpenAIP's free-tier API key
// (Block 16/17) shouldn't be hit every 5 minutes for data that's
// effectively static. Written to public/static/ (committed to git, NOT
// gitignored) rather than public/generated/, precisely to signal this
// different refresh cadence - the file needs to exist in every deploy's
// dist/ output, but is only regenerated deliberately, not per-build.
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "public/static/airspaces.json");

// Scoped to Sweden + Denmark (this project's coverage area) rather than
// the full ~31,500 worldwide airspaces OpenAIP has - keeps the static
// file small and avoids fetching/shipping data no site in SITES.md is
// anywhere near.
const COUNTRIES = ["SE", "DK"];
const OPENAIP_BASE_URL = "https://api.core.openaip.net/api/airspaces";

interface OpenAipAirspace {
  _id: string;
  name: string;
  type: number;
  icaoClass: number;
  activity: number;
  country: string;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  upperLimit: { value: number; unit: number; referenceDatum: number };
  lowerLimit: { value: number; unit: number; referenceDatum: number };
}

interface OpenAipListResponse {
  page: number;
  totalPages: number;
  totalCount: number;
  items: OpenAipAirspace[];
}

async function fetchCountryAirspaces(apiKey: string, country: string): Promise<OpenAipAirspace[]> {
  const url = `${OPENAIP_BASE_URL}?limit=1000&country=${country}&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAIP request failed for country=${country}: HTTP ${response.status}`);
  }
  const data = (await response.json()) as OpenAipListResponse;
  if (data.totalPages > 1) {
    // limit=1000 comfortably covers SE (474) and DK (189) as of the
    // Block 17 research pass - if this ever trips, the fix is
    // pagination, not a silently-truncated dataset.
    throw new Error(
      `OpenAIP returned ${data.totalPages} pages for country=${country} - limit=1000 no longer covers it, add pagination`,
    );
  }
  return data.items;
}

function toFeature(airspace: OpenAipAirspace) {
  return {
    type: "Feature" as const,
    geometry: airspace.geometry,
    properties: {
      id: airspace._id,
      name: airspace.name,
      type: airspace.type,
      typeLabel: AIRSPACE_TYPE_LABELS[airspace.type] ?? `Unknown (${airspace.type})`,
      category: categorizeAirspaceType(airspace.type),
      icaoClass: airspace.icaoClass,
      icaoClassLabel: ICAO_CLASS_LABELS[airspace.icaoClass] ?? `Unknown (${airspace.icaoClass})`,
      country: airspace.country,
      lowerLimitLabel: formatAltitudeLimit(airspace.lowerLimit),
      upperLimitLabel: formatAltitudeLimit(airspace.upperLimit),
    },
  };
}

async function main() {
  const apiKey = process.env.OPENAIP_KEY;
  if (!apiKey) {
    console.error("collect-airspaces: OPENAIP_KEY environment variable is not set - skipping (see docs/DECISIONS.md)");
    process.exitCode = 1;
    return;
  }

  const allAirspaces: OpenAipAirspace[] = [];
  for (const country of COUNTRIES) {
    const airspaces = await fetchCountryAirspaces(apiKey, country);
    allAirspaces.push(...airspaces);
    console.log(`collect-airspaces: fetched ${airspaces.length} airspaces for ${country}`);
  }

  const featureCollection = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    source: "OpenAIP (https://www.openaip.net)",
    features: allAirspaces.map(toFeature),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(featureCollection) + "\n", "utf-8");
  console.log(`collect-airspaces: wrote ${allAirspaces.length} airspaces -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`collect-airspaces: failed - ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
