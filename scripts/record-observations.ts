import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { collectLiveSamples } from "../src/providers/live/collectLive.ts";
import { forecastHourMs } from "../src/domain/forecastTime.ts";
import {
  appendObservations,
  buildObservationRow,
  monthFileName,
  observationKey,
  parseObservations,
  recordedKeys,
  type ObservationRow,
} from "../src/domain/observationLog.ts";
import type { GeneratedForecastSitesFile } from "../src/domain/types.ts";

/**
 * Records what the anemometers actually measured, beside what was
 * forecast for the same hour.
 *
 * Chunk A of BLOCKS.md Phase 4. Design and reasoning in
 * docs/FORECAST_VERIFICATION.md. This script only collects; nothing
 * analyses these rows yet and nothing shown to a visitor changes.
 *
 * It runs on GitHub Actions' free cron, which honours a schedule at
 * two-to-five-hour intervals rather than the one it is given. That is
 * fine and is why the row format is deliberately not a time series:
 * each row is a self-contained forecast-versus-measurement pair, so
 * irregular sampling costs nothing but volume. About seven to twelve
 * rows per site per day, which is several hundred a month - far more
 * than a bias figure needs.
 *
 * Nothing here is paid infrastructure. No Worker changes, no KV, no
 * server: the repository is the database, exactly as it already is for
 * the edit log and the suggestion list.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const forecastPath = resolve(repoRoot, "public/generated/forecast-sites.json");
const observationsDir = resolve(repoRoot, "data/observations");

/**
 * The forecast is read from the deployed site, not generated here.
 *
 * Two reasons, and the second is the one that matters.
 *
 * It is more correct: this file exists to check whether what pilots were
 * shown matched what the wind did. The published file is what they were
 * shown. Generating a fresh forecast would verify a number nobody ever
 * saw.
 *
 * And it is considerate. Open-Meteo rate-limits per IP, and this job
 * runs from the same GitHub Actions pool as weather-refresh.yml. When
 * this script called collect:forecasts itself it roughly doubled the
 * site-batch request rate from that pool, and within a day Open-Meteo
 * was answering 429 - which the collector handles by republishing the
 * last good file with its ORIGINAL generatedAt, so the site quietly
 * froze at a six-hour-old forecast while still deploying every two
 * hours. A verification tool must not degrade the thing it verifies.
 */
const PUBLISHED_FORECAST_URL = "https://startvind.se/generated/forecast-sites.json";

async function loadForecast(): Promise<GeneratedForecastSitesFile | null> {
  try {
    const res = await fetch(PUBLISHED_FORECAST_URL);
    if (res.ok) return (await res.json()) as GeneratedForecastSitesFile;
    console.warn(`record-observations: published forecast returned HTTP ${res.status}`);
  } catch (err) {
    console.warn(`record-observations: could not read the published forecast - ${(err as Error).message}`);
  }
  // Local fallback, for running this on a dev machine against whatever
  // the last local build produced.
  if (existsSync(forecastPath)) {
    console.warn("record-observations: falling back to the local generated forecast");
    return JSON.parse(readFileSync(forecastPath, "utf-8")) as GeneratedForecastSitesFile;
  }
  return null;
}

/** The height a site's flyability verdict is decided at, and the only one a surface anemometer can speak to. */
const SURFACE_HEIGHT_M = 10;

/**
 * The forecast hour an observation belongs to.
 *
 * Rounded to the nearest hour, not floored: a reading at 17:50 describes
 * 18:00's weather far better than 17:00's, and the pairing tolerance in
 * observationLog.ts then rejects anything still too far away.
 */
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

async function main() {
  const at = new Date().toISOString();

  // Without a forecast there is nothing to compare against, and a row
  // holding only an observation cannot verify anything.
  const forecast = await loadForecast();
  if (forecast === null) {
    console.warn("record-observations: no forecast available from the site or locally. Nothing recorded.");
    return;
  }
  console.log(`record-observations: comparing against the forecast published at ${forecast.generatedAt}`);

  const catalogue = buildCatalogue();
  const live = await collectLiveSamples(catalogue.sites, {
    onSiteFailed: (siteId, reason) => console.warn(`record-observations: ${siteId} - ${reason}`),
  });

  mkdirSync(observationsDir, { recursive: true });
  const filePath = resolve(observationsDir, monthFileName(at));
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const already = recordedKeys(parseObservations(existing));

  const rows: ObservationRow[] = [];
  let skippedDuplicate = 0;
  let skippedUnpairable = 0;

  for (const [siteId, entry] of Object.entries(live.sites)) {
    if (entry.status !== "ok" || !entry.sample) continue;

    const f = forecast.sites[siteId];
    if (!f) continue;

    const hour = nearestForecastHour(f.hours, entry.sample.timestamp);
    if (hour === null) continue;

    if (already.has(observationKey(siteId, hour))) {
      skippedDuplicate += 1;
      continue;
    }

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
      // Absent means the reader supplied a real measurement time; only
      // sources that cannot say so set it false. See WindSample.
      ageConfirmed: entry.sample.ageConfirmed !== false,
      fcMs: f.heights[SURFACE_HEIGHT_M].windSpeedMs[i] ?? null,
      fcDeg: f.heights[SURFACE_HEIGHT_M].windDirectionDeg[i] ?? null,
      fcGust: f.windGustMs[i] ?? null,
      // How old the forecast was when compared. The published file can
      // be hours stale when Open-Meteo rate-limits the refresh job, and
      // a bias figure that mixes fresh and stale forecasts measures two
      // things at once.
      fcIssued: forecast.generatedAt,
    });

    if (row === null) {
      skippedUnpairable += 1;
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    console.log(
      `record-observations: nothing new (${skippedDuplicate} already recorded this hour, ${skippedUnpairable} unpairable)`,
    );
    return;
  }

  writeFileSync(filePath, appendObservations(existing, rows), "utf-8");
  const total = parseObservations(readFileSync(filePath, "utf-8")).length;
  console.log(
    `record-observations: +${rows.length} rows (${skippedDuplicate} duplicate, ${skippedUnpairable} unpairable) ` +
      `-> ${filePath}, ${total} rows this month`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`record-observations failed - ${(err as Error).message}`);
    process.exit(1);
  });
}
