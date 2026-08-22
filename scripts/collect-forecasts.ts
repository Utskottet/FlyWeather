import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locatedEnabledSites } from "../src/domain/sites.ts";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { fetchSitesForecastBatch } from "../src/providers/forecast/openMeteoProvider.ts";
import { fetchWindGrid } from "../src/providers/forecast/openMeteoGridProvider.ts";
import { buildWindGrid } from "../src/domain/windGrid.ts";
import { computeSiteBounds } from "../src/components/Map/mapBounds.ts";
import { MODEL_HEIGHTS_M } from "../src/domain/types.ts";
import type { GeneratedForecastSitesFile, GeneratedWindGridFile, WindGridPoint } from "../src/domain/types.ts";

// 31x31 = up to 961 points, ~3x the 18x18=324 grid the architecture fix
// shipped with - safe to triple again now that fetching happens once
// here (server-side, ~every 5 min) rather than per-visitor, which was
// the actual constraint that broke production before (see
// docs/DECISIONS.md's "production regression" entry) - point count
// itself was never the problem once it moved off the client.
const GRID_RESOLUTION = 31;

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

/**
 * Guards against a shape drift between the currently-published grid
 * file and what this version of the collector expects. The wind grid
 * has changed shape twice now: first from single current-conditions
 * values to per-hour arrays, then (§ FlyWeather GUI Reorganization +
 * Coherent Height Wind) from flat windDirectionDeg/windSpeedMs arrays to
 * a `heights` record keyed by MODEL_HEIGHTS_M, mirroring SiteForecast -
 * needed so the animated wind field can follow HEIGHT the same way site
 * roses already do, not just show 10m wind forever. A file published by
 * an older version of this script has an incompatible shape either way.
 * If a fresh fetch fails and falls back to that stale-shaped file
 * without this check, the frontend's height lookups on what it expects
 * to be a `heights` record would throw or silently read `undefined`.
 * Treating a shape mismatch the same as "no fallback available" (empty
 * state) is safer than serving data the frontend can't actually consume -
 * do NOT reinterpret an old flat-array file as if it were multi-height.
 */
function isCompatibleGridFile(data: unknown): data is GeneratedWindGridFile {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Partial<GeneratedWindGridFile>;
  if (!Array.isArray(d.hours) || !Array.isArray(d.points)) return false;
  const [first] = d.points;
  if (first === undefined) return true;
  const heights = (first as Partial<WindGridPoint>).heights;
  if (typeof heights !== "object" || heights === null) return false;
  return MODEL_HEIGHTS_M.every((h) => {
    const series = (heights as Record<number, { windDirectionDeg?: unknown; windSpeedMs?: unknown }>)[h];
    return series !== undefined && Array.isArray(series.windDirectionDeg) && Array.isArray(series.windSpeedMs);
  });
}

async function main() {
  const catalogue = buildCatalogue();
  const sites = locatedEnabledSites(catalogue.sites);

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
    const { hours, points } = await fetchWindGrid(buildWindGrid(bounds, GRID_RESOLUTION));
    gridFile = { generatedAt: new Date().toISOString(), hours, points };
    console.log(`collect-forecasts: fetched fresh wind grid (${points.length} points x ${hours.length} hours)`);
  } catch (err) {
    console.warn(`collect-forecasts: wind-grid fetch failed - ${(err as Error).message}`);
    const fallback = await fetchPublished<unknown>("/generated/forecast-wind-grid.json");
    if (fallback && isCompatibleGridFile(fallback)) {
      gridFile = fallback;
      console.warn(`collect-forecasts: falling back to last published forecast-wind-grid.json (generatedAt=${fallback.generatedAt})`);
    } else {
      gridFile = { generatedAt: new Date().toISOString(), hours: [], points: [] };
      console.warn(
        fallback
          ? "collect-forecasts: previously published forecast-wind-grid.json has an incompatible (older) shape - writing empty rather than serving data the frontend can't read"
          : "collect-forecasts: no previously published forecast-wind-grid.json available either - writing empty",
      );
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
