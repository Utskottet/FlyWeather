import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { collectLiveSamples } from "../src/providers/live/collectLive.ts";
import { forecastHourMs } from "../src/domain/forecastTime.ts";
import {
  appendObservations,
  buildObservationRow,
  observationKey,
  parseObservations,
  recordedKeys,
  type ObservationRow,
} from "../src/domain/observationLog.ts";
import type { GeneratedForecastSitesFile } from "../src/domain/types.ts";

/**
 * The lab's own recorder, for fast local iteration.
 *
 * This is a convenience copy of the production recorder
 * (scripts/record-observations.ts) that writes to a lab-only file instead
 * of data/observations/. Run it for a few days and the lab has fresh rows
 * without waiting on GitHub's scheduler or touching the canonical dataset.
 *
 * It is deliberately NOT the place the real data lives: the production
 * cron keeps data/observations/ as the source of truth, and its rows are
 * the ones that will matter in a year. Nothing here is committed - the
 * output is gitignored.
 *
 * Usage:
 *   npm run lab:collect                       # one pass
 *   npm run lab:collect -- --loop 15          # then every 15 minutes
 *   npm run lab:collect -- --loop 15 --forecast-url https://startvind.se/generated/forecast-sites.json
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const labDir = resolve(repoRoot, "tools/accuracy-lab/out");
const labFile = resolve(labDir, "lab-observations.jsonl");
const localForecastPath = resolve(repoRoot, "public/generated/forecast-sites.json");

const DEFAULT_FORECAST_URL = "https://startvind.se/generated/forecast-sites.json";
const SURFACE_HEIGHT_M = 10;

function parseArgs(argv: string[]) {
  const out = { loopMinutes: 0, forecastUrl: DEFAULT_FORECAST_URL };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--loop") out.loopMinutes = Number(argv[++i]);
    else if (argv[i] === "--forecast-url") out.forecastUrl = argv[++i];
  }
  return out;
}

async function loadForecast(url: string): Promise<GeneratedForecastSitesFile | null> {
  try {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as GeneratedForecastSitesFile;
    console.warn(`lab-collect: published forecast returned HTTP ${res.status}`);
  } catch (err) {
    console.warn(`lab-collect: could not read the published forecast - ${(err as Error).message}`);
  }
  if (existsSync(localForecastPath)) {
    console.warn("lab-collect: falling back to the local generated forecast");
    return JSON.parse(readFileSync(localForecastPath, "utf-8")) as GeneratedForecastSitesFile;
  }
  return null;
}

function nearestForecastHour(forecastHours: string[], observedAt: string): string | null {
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return null;
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const h of forecastHours) {
    const diff = Math.abs(forecastHourMs(h) - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = h;
    }
  }
  return best;
}

async function collectOnce(url: string): Promise<number> {
  const at = new Date().toISOString();
  const forecast = await loadForecast(url);
  if (forecast === null) {
    console.warn("lab-collect: no forecast available. Nothing recorded.");
    return 0;
  }

  const catalogue = buildCatalogue();
  const live = await collectLiveSamples(catalogue.sites, {
    onSiteFailed: (siteId, reason) => console.warn(`lab-collect: ${siteId} - ${reason}`),
  });

  mkdirSync(labDir, { recursive: true });
  const existing = existsSync(labFile) ? readFileSync(labFile, "utf-8") : "";
  const already = recordedKeys(parseObservations(existing));

  const rows: ObservationRow[] = [];
  for (const [siteId, entry] of Object.entries(live.sites)) {
    if (entry.status !== "ok" || !entry.sample) continue;
    const f = forecast.sites[siteId];
    if (!f) continue;
    const hour = nearestForecastHour(f.hours, entry.sample.timestamp);
    if (hour === null || already.has(observationKey(siteId, hour))) continue;
    const i = f.hours.indexOf(hour);
    const row = buildObservationRow({
      at,
      site: siteId,
      hour,
      observedAt: entry.sample.timestamp,
      obsMs: entry.sample.windSpeedMs,
      obsDeg: entry.sample.variableDirection ? null : entry.sample.windDirectionDeg,
      obsGust: entry.sample.windGustMs,
      source: entry.sample.sourceId,
      ageConfirmed: entry.sample.ageConfirmed !== false,
      fcMs: f.heights[SURFACE_HEIGHT_M].windSpeedMs[i] ?? null,
      fcDeg: f.heights[SURFACE_HEIGHT_M].windDirectionDeg[i] ?? null,
      fcGust: f.windGustMs[i] ?? null,
      fcIssued: forecast.generatedAt,
    });
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    console.log(`lab-collect: nothing new (forecast issued ${forecast.generatedAt})`);
    return 0;
  }
  writeFileSync(labFile, appendObservations(existing, rows), "utf-8");
  const total = parseObservations(readFileSync(labFile, "utf-8")).length;
  console.log(`lab-collect: +${rows.length} rows -> ${labFile} (${total} total)`);
  return rows.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await collectOnce(args.forecastUrl);
  if (args.loopMinutes > 0) {
    console.log(`lab-collect: looping every ${args.loopMinutes} min. Ctrl+C to stop.`);
    for (;;) {
      await sleep(args.loopMinutes * 60_000);
      try {
        await collectOnce(args.forecastUrl);
      } catch (err) {
        console.warn(`lab-collect: pass failed - ${(err as Error).message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`lab-collect failed - ${(err as Error).message}`);
  process.exit(1);
});
