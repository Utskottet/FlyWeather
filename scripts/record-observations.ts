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

  if (!existsSync(forecastPath)) {
    // Without a forecast there is nothing to compare against, and a row
    // holding only an observation cannot verify anything.
    console.warn("record-observations: no forecast-sites.json - run collect:forecasts first. Nothing recorded.");
    return;
  }
  const forecast = JSON.parse(readFileSync(forecastPath, "utf-8")) as GeneratedForecastSitesFile;

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
