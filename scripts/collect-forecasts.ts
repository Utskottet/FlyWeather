import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { sitesDataSchema, locatedEnabledSites } from "../src/domain/sites.ts";
import { extractYamlBlock } from "./parse-sites.ts";
import { fetchSitesForecastBatch } from "../src/providers/forecast/openMeteoProvider.ts";
import { fetchWindGrid } from "../src/providers/forecast/openMeteoGridProvider.ts";
import { buildWindGrid } from "../src/domain/windGrid.ts";
import { computeSiteBounds } from "../src/components/Map/mapBounds.ts";
import type { GeneratedForecastSitesFile, GeneratedWindGridFile } from "../src/domain/types.ts";

// Same resolution the old client-side useWindGrid.ts used before this
// architecture fix - see docs/DECISIONS.md's "production regression"
// entry for why per-visitor fetching (even at this size) had to move
// server-side rather than just being tuned further.
const GRID_RESOLUTION = 18;

// Every visitor's browser used to call Open-Meteo directly (site
// forecasts + wind grid), which tripped Open-Meteo's real rate limit
// under live traffic once the grid grew denser. Both datasets are now
// fetched here, once per weather-refresh cron run (every 5 min, GitHub
// Actions' own IP - not per visitor), and published as static files the
// frontend just reads. If a fetch fails, this falls back to
// re-publishing whatever is already live (with ITS original
// generatedAt, not "now") rather than overwriting good data with
// nothing - a single Open-Meteo hiccup shouldn't blank out the whole
// site until the next successful refresh.
const PUBLISHED_BASE_URL = "https://utskottet.github.io/FlyWeather";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesMdPath = resolve(repoRoot, "SITES.md");
const sitesOutPath = resolve(repoRoot, "public/generated/forecast-sites.json");
const gridOutPath = resolve(repoRoot, "public/generated/forecast-wind-grid.json");

async function fetchPublished<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PUBLISHED_BASE_URL}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function main() {
  const markdown = readFileSync(sitesMdPath, "utf-8");
  const raw = parseYaml(extractYamlBlock(markdown));
  const parsed = sitesDataSchema.parse(raw);
  const sites = locatedEnabledSites(parsed.sites);

  // --- Site forecasts ---
  let sitesFile: GeneratedForecastSitesFile;
  try {
    const forecasts = await fetchSitesForecastBatch(
      sites.map((s) => ({ siteId: s.id, lat: s.coordinates.lat, lon: s.coordinates.lon })),
    );
    sitesFile = {
      generatedAt: new Date().toISOString(),
      sites: Object.fromEntries(forecasts.map((f) => [f.siteId, f])),
    };
    console.log(`collect-forecasts: fetched fresh forecasts for ${forecasts.length} sites`);
  } catch (err) {
    console.warn(`collect-forecasts: site-forecast fetch failed - ${(err as Error).message}`);
    const fallback = await fetchPublished<GeneratedForecastSitesFile>("/generated/forecast-sites.json");
    if (fallback) {
      sitesFile = fallback;
      console.warn(`collect-forecasts: falling back to last published forecast-sites.json (generatedAt=${fallback.generatedAt})`);
    } else {
      sitesFile = { generatedAt: new Date().toISOString(), sites: {} };
      console.warn("collect-forecasts: no previously published forecast-sites.json available either - writing empty");
    }
  }

  // --- Wind grid ---
  let gridFile: GeneratedWindGridFile;
  const bounds = computeSiteBounds(sites);
  try {
    if (!bounds) throw new Error("no located sites to compute grid bounds from");
    const points = await fetchWindGrid(buildWindGrid(bounds, GRID_RESOLUTION));
    gridFile = { generatedAt: new Date().toISOString(), points };
    console.log(`collect-forecasts: fetched fresh wind grid (${points.length} points)`);
  } catch (err) {
    console.warn(`collect-forecasts: wind-grid fetch failed - ${(err as Error).message}`);
    const fallback = await fetchPublished<GeneratedWindGridFile>("/generated/forecast-wind-grid.json");
    if (fallback) {
      gridFile = fallback;
      console.warn(`collect-forecasts: falling back to last published forecast-wind-grid.json (generatedAt=${fallback.generatedAt})`);
    } else {
      gridFile = { generatedAt: new Date().toISOString(), points: [] };
      console.warn("collect-forecasts: no previously published forecast-wind-grid.json available either - writing empty");
    }
  }

  mkdirSync(dirname(sitesOutPath), { recursive: true });
  writeFileSync(sitesOutPath, JSON.stringify(sitesFile) + "\n", "utf-8");
  writeFileSync(gridOutPath, JSON.stringify(gridFile) + "\n", "utf-8");
  console.log(`collect-forecasts: wrote ${sitesOutPath} and ${gridOutPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // Never let a total failure here block the rest of the build - the
    // frontend already degrades gracefully to gray/unknown roses and an
    // empty wind grid when this data is missing/stale, which is better
    // than blocking every deploy (including unrelated code changes) on
    // an Open-Meteo outage.
    console.error(`collect-forecasts: unexpected failure - ${(err as Error).message}`);
  });
}
