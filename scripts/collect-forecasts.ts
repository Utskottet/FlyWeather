import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locatedEnabledSites } from "../src/domain/sites.ts";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { fetchSitesForecastBatch } from "../src/providers/forecast/openMeteoProvider.ts";
import { fetchWindGrid } from "../src/providers/forecast/openMeteoGridProvider.ts";
import { fetchDmiWindGrid, fetchDmiWindManifestEntry, mergeDmiWindIntoSiteForecast } from "../src/providers/forecast/dmiWindProvider.ts";
import { buildWindGrid } from "../src/domain/windGrid.ts";
import { computeSiteBounds, type LatLonBounds } from "../src/components/Map/mapBounds.ts";
import { MODEL_HEIGHTS_M } from "../src/domain/types.ts";
import type { GeneratedForecastSitesFile, GeneratedWindGridFile, SiteForecast, WindGridPoint } from "../src/domain/types.ts";

// § Simplify DMI Wind v1: real DMI HARMONIE DINI wind (dmi/wind.py's Wind
// v1, 10-450m native AGL) is now the primary source for both the animated
// regional field and per-site wind, with Open-Meteo as the fallback -
// reversing the prior default. Open-Meteo is always fetched first and
// used as-is (unchanged code path, same resilience it already had); DMI is
// then attempted as an *enhancement* on top of that baseline - if it
// succeeds, both the grid and every site's wind get upgraded to real DMI
// values; if DMI is unavailable for any reason, whatever Open-Meteo
// already produced (fresh or its own last-published fallback) is kept
// exactly as before. This never makes the existing Open-Meteo resilience
// any weaker, only adds a preferred source on top of it.
const SOARING_BASE_URL = "https://utskottet.github.io/FlyWeather-Soaring";

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

  // --- Wind grid bounds ---
  // Real bug (2026-08-24): this used to ALWAYS be computeSiteBounds(sites)
  // regardless of source, so even once DMI wind became the active source
  // for the grid below, it was only ever sampled within the located
  // sites' own small bounding box (Skane/Denmark) - nowhere near DMI's
  // real coverage, which matches RASP's full south-scandinavia region
  // (up to Stockholm). Prefer DMI's own published grid.bbox (the same
  // region RASP's raster is rendered for) when reachable; fall back to
  // site bounds only so the Open-Meteo-only baseline still has *some*
  // area to query if the DMI manifest can't be reached at all.
  const siteBounds = computeSiteBounds(sites);
  let gridBounds: LatLonBounds | null = siteBounds;
  try {
    const windEntry = await fetchDmiWindManifestEntry(SOARING_BASE_URL);
    const [minLon, minLat, maxLon, maxLat] = windEntry.grid.bbox;
    gridBounds = { minLat, maxLat, minLon, maxLon };
  } catch (err) {
    console.warn(`collect-forecasts: could not read DMI's grid bbox up front, falling back to site bounds - ${(err as Error).message}`);
  }

  // --- Wind grid (baseline, Open-Meteo) ---
  let gridFile: GeneratedWindGridFile;
  try {
    if (!gridBounds) throw new Error("no grid bounds available (no located sites and no DMI manifest)");
    const { hours, points } = await fetchWindGrid(buildWindGrid(gridBounds, GRID_RESOLUTION));
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

  // --- DMI wind (primary source; enhances whatever Open-Meteo baseline was already produced above) ---
  // Sampled at the grid points AND every site's own coordinates in a single
  // batch (one manifest fetch + one set of per-hour file fetches shared
  // across both consumers), so the animated field and every site rose come
  // from the exact same DMI run/valid-times/heights (§56 "share HEIGHT/
  // run/time"). A DMI failure here leaves gridFile/sitesFile exactly as
  // Open-Meteo already produced them above - never a partial/mixed write.
  try {
    if (!gridBounds) throw new Error("no grid bounds available (no located sites and no DMI manifest)");
    const gridQueryPoints = buildWindGrid(gridBounds, GRID_RESOLUTION);
    const sitesWithForecast = sites.filter((s) => sitesFile.sites[s.id] !== undefined);
    const sitePoints = sitesWithForecast.map((s) => ({ lat: s.coordinates.lat, lon: s.coordinates.lon }));

    const { hours: dmiHours, points: dmiPoints } = await fetchDmiWindGrid(SOARING_BASE_URL, [
      ...gridQueryPoints,
      ...sitePoints,
    ]);
    const dmiGridPoints = dmiPoints.slice(0, gridQueryPoints.length);
    const dmiSitePoints = dmiPoints.slice(gridQueryPoints.length);

    gridFile = { generatedAt: new Date().toISOString(), hours: dmiHours, points: dmiGridPoints };

    const upgradedSites: GeneratedForecastSitesFile["sites"] = { ...sitesFile.sites };
    sitesWithForecast.forEach((s, i) => {
      upgradedSites[s.id] = mergeDmiWindIntoSiteForecast(sitesFile.sites[s.id] as SiteForecast, dmiSitePoints[i], dmiHours);
    });
    sitesFile = { ...sitesFile, sites: upgradedSites };

    console.log(
      `collect-forecasts: DMI wind v1 active - upgraded grid (${dmiGridPoints.length} points x ${dmiHours.length} hours) and ${sitesWithForecast.length} site forecasts`,
    );
  } catch (err) {
    console.warn(`collect-forecasts: DMI wind unavailable, staying on Open-Meteo - ${(err as Error).message}`);
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
