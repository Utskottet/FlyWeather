import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { parseObservations, type ObservationRow } from "../src/domain/observationLog.ts";
import {
  joinLeadPairs,
  leadBucket,
  parseLeadForecasts,
  LEAD_BUCKET_ORDER,
  type LeadForecastRecord,
} from "../src/domain/leadForecast.ts";
import {
  DEFAULT_ACCURACY_OPTIONS,
  summariseAccuracy,
  type AccuracyOptions,
  type AccuracySite,
} from "../src/domain/accuracy.ts";
import type { Site } from "../src/domain/sites.ts";

/**
 * The accuracy table: what the recorder measured, turned into numbers.
 *
 * Reads data/observations/*.jsonl (all months) plus any lab-only rows,
 * scores every site against its own anemometer, and writes one JSON file
 * the local lab dashboard reads. This is a lab tool - nothing here runs
 * in the build, and the output is not part of the deployed site.
 *
 * Usage:
 *   npm run lab:analyze
 *   npm run lab:analyze -- --dir data/observations
 *   npm run lab:analyze -- --extra tools/accuracy-lab/out/lab-observations.jsonl
 *   npm run lab:analyze -- --min 25 --out tools/accuracy-lab/out/accuracy.json
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_OUT = resolve(repoRoot, "tools/accuracy-lab/out/accuracy.json");
const DEFAULT_OBS_DIR = resolve(repoRoot, "data/observations");

interface Args {
  out: string;
  dir: string;
  extra: string | null;
  options: AccuracyOptions;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: DEFAULT_OUT, dir: DEFAULT_OBS_DIR, extra: null, options: { ...DEFAULT_ACCURACY_OPTIONS } };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") args.out = resolve(repoRoot, argv[++i]);
    else if (a === "--dir") args.dir = resolve(repoRoot, argv[++i]);
    else if (a === "--extra") args.extra = resolve(repoRoot, argv[++i]);
    else if (a === "--min") args.options.minSample = Number(argv[++i]);
    else if (a === "--speed-tol") args.options.speedToleranceMs = Number(argv[++i]);
    else if (a === "--dir-tol") args.options.directionToleranceDeg = Number(argv[++i]);
  }
  return args;
}

/** Every *.jsonl under a directory, sorted so month order is stable. */
function jsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => extname(name) === ".jsonl")
    .sort()
    .map((name) => join(dir, name));
}

function readRows(files: string[]): ObservationRow[] {
  const rows: ObservationRow[] = [];
  for (const file of files) {
    try {
      rows.push(...parseObservations(readFileSync(file, "utf-8")));
    } catch (err) {
      console.warn(`analyze-accuracy: skipping ${file} - ${(err as Error).message}`);
    }
  }
  return rows;
}

function toAccuracySite(site: Site): AccuracySite {
  return {
    id: site.id,
    name: site.name,
    sector: site.sector ?? null,
    wind: site.wind,
    station: site.station
      ? {
          provider: site.station.provider,
          stationId: site.station.station_id ?? null,
          verified: site.station.verified,
          distanceKm: site.station_distance_km ?? null,
        }
      : null,
    hasStation: site.station !== null && site.station !== undefined,
  };
}

function fmt(n: number | null, digits = 1): string {
  return n === null ? "  –  " : n.toFixed(digits).padStart(5);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const files = jsonlFiles(args.dir);
  if (args.extra && existsSync(args.extra)) files.push(args.extra);
  const rows = readRows(files);

  // The future forecasts recorded by the recorder, joined with the
  // observation for the hour each one predicted. These feed the lead-time
  // table only; the headline stays short-range.
  const leadFiles = jsonlFiles(resolve(repoRoot, "data/lead-forecasts"));
  const leads: LeadForecastRecord[] = [];
  for (const lf of leadFiles) {
    try {
      leads.push(...parseLeadForecasts(readFileSync(lf, "utf-8")));
    } catch (err) {
      console.warn(`analyze-accuracy: skipping ${lf} - ${(err as Error).message}`);
    }
  }
  const leadPairs = joinLeadPairs(rows, leads);
  const leadRows = rows.concat(leadPairs);

  const catalogue = buildCatalogue();
  // Enabled sites only - archived entries have no station and no data, and
  // listing them would bury the sites that actually matter.
  const sites = catalogue.sites.filter((s) => s.enabled).map(toAccuracySite);
  const report = summariseAccuracy(
    rows,
    sites,
    args.options,
    {
      generatedAt: new Date().toISOString(),
      sourceFiles: [...files, ...leadFiles].map((f) => f.replace(repoRoot + "\\", "").replace(repoRoot + "/", "")),
    },
    leadRows,
  );

  // How the lead-time table is filling: total paired samples per column.
  const leadCounts = new Map<string, number>(LEAD_BUCKET_ORDER.map((b) => [b, 0]));
  for (const p of leadRows) {
    const lh = p.fc.issued ? (Date.parse(p.hour) - Date.parse(p.fc.issued)) / 3_600_000 : null;
    if (lh === null || !Number.isFinite(lh)) continue;
    const b = leadBucket(lh);
    leadCounts.set(b, (leadCounts.get(b) ?? 0) + 1);
  }

  // Sites come and go: an id in the rows that the catalogue no longer has
  // (renamed, archived, moved) must stay visible rather than vanish from
  // the total. Adding a site needs nothing here - it is picked up from the
  // catalogue on the next run; this only guards the opposite direction.
  const known = new Set(sites.map((s) => s.id));
  const unknownSites = [...new Set(rows.map((r) => r.site))].filter((id) => !known.has(id)).sort();
  if (unknownSites.length > 0) {
    report.unknownSites = unknownSites;
    console.warn(`analyze-accuracy: rows exist for ${unknownSites.length} site(s) not in the catalogue: ${unknownSites.join(", ")}`);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(report, null, 2) + "\n", "utf-8");

  // Every site with rows is listed. A site is ranked by its headline only
  // when it has enough launchable hours; otherwise it sorts to the bottom
  // and its headline is shown as blank rather than a number from noise.
  const scored = report.sites
    .filter((s) => s.overall.n > 0)
    .sort((a, b) => headlineValue(b) - headlineValue(a));
  function headlineValue(s: (typeof report.sites)[number]): number {
    return s.overall.launchableConfident ? (s.overall.accuracyPct ?? -1) : -1;
  }
  const confident = report.sites.filter((s) => s.overall.confident).length;
  const withStation = sites.filter((s) => s.hasStation).length;
  const usableRef = report.sites.filter((s) => s.referenceQuality !== "unusable").length;

  console.log(`\naccuracy lab — ${rows.length} paired hours across ${report.sites.filter((s) => s.overall.n > 0).length} sites`);
  console.log(
    `sites: ${sites.length} catalogued, ${withStation} with a station, ${usableRef} with a usable reference, ${confident} with enough data to be confident`,
  );
  console.log(
    `headline = launchable wind (observed ≥ the site's cutoff, default ${args.options.directionMinObsMs} m/s) within ±${args.options.speedToleranceMs} m/s AND ±${args.options.directionToleranceDeg}°`,
  );
  console.log(`speed is scored at every wind; direction only above the cutoff.`);
  console.log(
    `lead-time samples: ${LEAD_BUCKET_ORDER.map((b) => `${b}=${leadCounts.get(b) ?? 0}`).join("  ")}\n`,
  );
  console.log("site                        ref          n dirN  hit%  ±spd%  ±dir%   bias  median  dirB± verdict  falseGreen");
  console.log("-".repeat(104));
  for (const s of scored) {
    const o = s.overall;
    const headline = o.launchableConfident ? fmt(o.accuracyPct) : "  –  ";
    console.log(
      `${s.siteId.padEnd(24)} ${s.referenceQuality.padEnd(11).slice(0, 11)} ${String(o.n).padStart(3)} ${String(o.directionN).padStart(4)} ` +
        `${headline} ${fmt(o.withinSpeedPct)} ${fmt(o.withinDirPct)} ${fmt(o.biasMs, 2)} ${fmt(o.medianAbsErrMs, 2)} ` +
        `${fmt(o.dirBiasDeg, 0)} ${fmt(o.verdictAgreementPct)} ${String(o.falseGreenOverLimitHours).padStart(10)}`,
    );
  }
  const thin = report.sites.filter((s) => s.overall.n > 0 && !s.overall.launchableConfident);
  if (thin.length > 0) {
    console.log(
      `\ntoo few launchable hours (headline blank) - need ≥${args.options.minLaunchableSample}: ` +
        thin.map((s) => `${s.siteId} (${s.overall.directionN})`).join(", "),
    );
  }
  const flagged = report.sites.filter((s) => s.referenceQuality !== "good" && s.overall.n > 0);
  if (flagged.length > 0) {
    console.log(`\nreference not good (${flagged.length}):`);
    for (const s of flagged) {
      console.log(`  ${s.siteId.padEnd(24)} [${s.referenceQuality}] ${s.referenceNote ?? ""}`);
    }
  }
  const noData = report.sites.filter((s) => s.overall.n === 0);
  if (noData.length > 0) {
    console.log(`\nno data yet (${noData.length}): ${noData.map((s) => s.siteId).join(", ")}`);
  }
  console.log(`\nwrote ${args.out}`);
}

main();
