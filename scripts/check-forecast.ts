import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { locatedEnabledSites, type LocatedSite } from "../src/domain/sites.ts";
import { evaluateFlyability } from "../src/domain/flyability.ts";
import { forecastHourMs } from "../src/domain/forecastTime.ts";
import type { RoseState } from "../src/components/WindRose/index.ts";
import type { GeneratedForecastSitesFile } from "../src/domain/types.ts";

/**
 * The ruler: what Startvind shows, measured against a second opinion.
 *
 * This exists because a wrong number is invisible. The forecast source
 * mix documented in docs/FORECAST_INTEGRITY.md survived months of green
 * test runs and rendered perfectly on every page - the only thing wrong
 * with it was the value, and nothing in the repository was capable of
 * noticing that. Unit tests check that code does what it was written to
 * do; this checks whether what it was written to do produces a true
 * answer.
 *
 * met.no is the comparison because it is independent of Open-Meteo, it
 * is what Swedish pilots actually cross-check against (YR is met.no),
 * and it is free and keyless. It is a second opinion, not ground truth -
 * two models agreeing means neither is obviously broken, nothing more.
 *
 * The number that matters is not the mean error in m/s. It is the count
 * of hours where the two sources disagree about whether a site is
 * flyable, split by direction: showing green where met.no says red is a
 * different kind of wrong from showing red where met.no says green.
 * Deltas are reported too, because they explain the flips.
 *
 * Usage:
 *   npm run check:forecast
 *   npm run check:forecast -- --json reports/before.json
 *   npm run check:forecast -- --site hovs-hallar-nv --hours 24
 */

const MET_NO_BASE = "https://api.met.no/weatherapi/locationforecast/2.0/complete";

// met.no's terms require an identifying User-Agent with a way to reach
// the operator. The site URL is that contact point.
const USER_AGENT = "Startvind/1.0 (+https://startvind.se)";

// Polite spacing between requests. met.no does not publish a hard rate
// limit for this volume (~20 sites), but hammering a free public service
// from a script is how access gets withdrawn.
const REQUEST_GAP_MS = 250;

/** How far ahead to compare, unless --hours says otherwise. */
const DEFAULT_HOURS = 72;

/** The height a site's flyability verdict is decided at. */
const SURFACE_HEIGHT_M = 10;

/**
 * Below this, a verdict disagreement is noise rather than a finding.
 *
 * The first run of this tool counted 66 "too optimistic" hours, and most
 * of them looked like dk-lokken at 0.5 m/s shown orange where met.no
 * said red. At half a metre per second the wind has no meaningful
 * direction - the two models put it on opposite sides of a site's sector
 * and the verdict flips, while nobody would fly either way. Grimeton is
 * the clearest case: its mean signed error is 0.02 m/s, yet it produced
 * 35 flips, every one of them direction noise at near-calm.
 *
 * Counting those beside "6.4 m/s shown green where met.no says 8.7 and
 * red" would let a fix look good or bad for reasons that have nothing to
 * do with the bug. So flips are reported twice: all of them, and the
 * ones in wind somebody might actually launch in. The second number is
 * the one that has to go down.
 */
const FLYABLE_SPEED_MS = 3;

/**
 * Not every optimistic hour is a dangerous one.
 *
 * A site turns red for two opposite reasons: too little wind to stay up,
 * and too much to be safe. Showing green when met.no says the wind is too
 * light costs somebody a drive. Showing green when met.no says it is over
 * the site's own maximum is the failure this whole investigation is
 * about - Barseback at 6.4 m/s green where the real forecast was 8.7 and
 * red.
 *
 * So optimistic flips are split once more, and this is the number that
 * actually measures risk.
 */
function isOverStrong(site: LocatedSite, theirs: HourComparison["theirs"]): boolean {
  const max = site.wind.max_ms;
  const hardGust = site.wind.hard_max_gust_ms;
  if (max !== undefined && theirs.speedMs > max) return true;
  if (hardGust !== undefined && theirs.gustMs !== null && theirs.gustMs > hardGust) return true;
  return false;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const forecastPath = resolve(repoRoot, "public/generated/forecast-sites.json");

interface HourComparison {
  hourIso: string;
  ours: { speedMs: number | null; directionDeg: number | null; gustMs: number | null };
  theirs: { speedMs: number; directionDeg: number; gustMs: number | null };
  deltaMs: number;
  ourState: RoseState;
  theirState: RoseState;
}

interface SiteReport {
  siteId: string;
  name: string;
  /** Hours the generated file has at all, including the ones with no wind in them. */
  hoursPublished: number;
  /** Hours where our own 10 m wind is null - published, but empty. */
  hoursMissing: number;
  /** Hours where both sides have a value and a verdict, so a comparison is possible. */
  hoursCompared: number;
  meanDeltaMs: number | null;
  maxDeltaMs: number | null;
  /** Signed: negative means Startvind reads lower than met.no. */
  meanSignedDeltaMs: number | null;
  verdictSame: number;
  /** Startvind greener than met.no - the dangerous direction. */
  tooOptimistic: number;
  /** The subset of those in wind worth launching in - see FLYABLE_SPEED_MS. */
  tooOptimisticFlyable: number;
  /** The subset where met.no exceeds the site's own limits - the risk number. */
  tooOptimisticOverStrong: number;
  /** Startvind redder than met.no. */
  tooPessimistic: number;
  /** The worst few optimistic hours, for a human to look at. */
  worstOptimistic: HourComparison[];
  error?: string;
}

interface MetNoResponse {
  properties: {
    timeseries: {
      time: string;
      data: {
        instant: {
          details: {
            wind_speed?: number;
            wind_from_direction?: number;
            wind_speed_of_gust?: number;
          };
        };
      };
    }[];
  };
}

/** green > orange > red. gray means "no verdict", never compared. */
const STATE_RANK: Record<RoseState, number> = { green: 3, orange: 2, red: 1, gray: 0 };

function parseArgs(argv: string[]) {
  const out: { json?: string; site?: string; hours: number } = { hours: DEFAULT_HOURS };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") out.json = argv[++i];
    else if (argv[i] === "--site") out.site = argv[++i];
    else if (argv[i] === "--hours") out.hours = Number(argv[++i]);
  }
  return out;
}

/**
 * Both sides become real instants before anything is compared.
 *
 * Our own generated hours may or may not carry a zone - files published
 * before domain/forecastTime.ts landed do not - while met.no always
 * stamps a Z. parseForecastHour settles that for both.
 */
function toEpoch(iso: string): number {
  return forecastHourMs(iso);
}

async function fetchMetNo(site: LocatedSite): Promise<Map<number, HourComparison["theirs"]>> {
  // met.no asks for no more than 4 decimals; more just fragments their cache.
  const lat = site.coordinates.lat.toFixed(4);
  const lon = site.coordinates.lon.toFixed(4);
  const res = await fetch(`${MET_NO_BASE}?lat=${lat}&lon=${lon}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`met.no HTTP ${res.status}`);
  const raw = (await res.json()) as MetNoResponse;

  const byHour = new Map<number, HourComparison["theirs"]>();
  for (const entry of raw.properties.timeseries) {
    const d = entry.data.instant.details;
    if (d.wind_speed === undefined || d.wind_from_direction === undefined) continue;
    byHour.set(toEpoch(entry.time), {
      speedMs: d.wind_speed,
      directionDeg: d.wind_from_direction,
      gustMs: d.wind_speed_of_gust ?? null,
    });
  }
  return byHour;
}

function compareSite(
  site: LocatedSite,
  forecast: GeneratedForecastSitesFile["sites"][string] | undefined,
  theirs: Map<number, HourComparison["theirs"]>,
  windowHours: number,
): SiteReport {
  const base: SiteReport = {
    siteId: site.id,
    name: site.name,
    hoursPublished: forecast?.hours.length ?? 0,
    hoursMissing: 0,
    hoursCompared: 0,
    meanDeltaMs: null,
    maxDeltaMs: null,
    meanSignedDeltaMs: null,
    verdictSame: 0,
    tooOptimistic: 0,
    tooOptimisticFlyable: 0,
    tooOptimisticOverStrong: 0,
    tooPessimistic: 0,
    worstOptimistic: [],
  };
  if (!forecast) return { ...base, error: "no forecast published for this site" };

  const now = Date.now();
  const until = now + windowHours * 3_600_000;
  const comparisons: HourComparison[] = [];
  let missing = 0;

  forecast.hours.forEach((hourIso, i) => {
    const at = toEpoch(hourIso);
    if (at < now || at > until) return;

    const ourSpeed = forecast.heights[SURFACE_HEIGHT_M].windSpeedMs[i] ?? null;
    const ourDir = forecast.heights[SURFACE_HEIGHT_M].windDirectionDeg[i] ?? null;
    const ourGust = forecast.windGustMs[i] ?? null;

    // Published but empty. Counted separately from "we disagree": an
    // hour with no wind in it is a different failure from a wrong one,
    // and averaging it away as a zero would hide it completely.
    if (ourSpeed === null || ourDir === null) {
      missing += 1;
      return;
    }

    const t = theirs.get(at);
    if (!t) return;

    const ourVerdict = evaluateFlyability(ourDir, ourSpeed, ourGust, site.sector ?? null, site.wind);
    const theirVerdict = evaluateFlyability(t.directionDeg, t.speedMs, t.gustMs, site.sector ?? null, site.wind);

    comparisons.push({
      hourIso,
      ours: { speedMs: ourSpeed, directionDeg: ourDir, gustMs: ourGust },
      theirs: t,
      deltaMs: ourSpeed - t.speedMs,
      ourState: ourVerdict.state,
      theirState: theirVerdict.state,
    });
  });

  // A gray verdict on either side means one of them declined to judge -
  // usually an unverified speed band. Nothing useful to compare there.
  const judged = comparisons.filter((c) => c.ourState !== "gray" && c.theirState !== "gray");
  const optimistic = judged.filter((c) => STATE_RANK[c.ourState] > STATE_RANK[c.theirState]);

  return {
    ...base,
    hoursMissing: missing,
    hoursCompared: comparisons.length,
    meanDeltaMs: mean(comparisons.map((c) => Math.abs(c.deltaMs))),
    maxDeltaMs: comparisons.length === 0 ? null : Math.max(...comparisons.map((c) => Math.abs(c.deltaMs))),
    meanSignedDeltaMs: mean(comparisons.map((c) => c.deltaMs)),
    verdictSame: judged.filter((c) => c.ourState === c.theirState).length,
    tooOptimistic: optimistic.length,
    tooOptimisticFlyable: optimistic.filter((c) => c.theirs.speedMs >= FLYABLE_SPEED_MS).length,
    tooOptimisticOverStrong: optimistic.filter((c) => isOverStrong(site, c.theirs)).length,
    tooPessimistic: judged.filter((c) => STATE_RANK[c.ourState] < STATE_RANK[c.theirState]).length,
    // Flyable ones first: an optimistic hour at 8 m/s matters, one at
    // 0.5 m/s is a curiosity.
    worstOptimistic: [...optimistic]
      .sort(
        (a, b) =>
          Number(isOverStrong(site, b.theirs)) - Number(isOverStrong(site, a.theirs)) ||
          Number(b.theirs.speedMs >= FLYABLE_SPEED_MS) - Number(a.theirs.speedMs >= FLYABLE_SPEED_MS) ||
          a.deltaMs - b.deltaMs,
      )
      .slice(0, 3),
  };
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(n: number | null, digits = 1): string {
  return n === null ? "  -  " : n.toFixed(digits).padStart(5);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const catalogue = buildCatalogue();
  let sites = locatedEnabledSites(catalogue.sites);
  if (args.site) sites = sites.filter((s) => s.id === args.site);
  if (sites.length === 0) throw new Error(args.site ? `no enabled site with id "${args.site}"` : "no located sites");

  const generated = JSON.parse(readFileSync(forecastPath, "utf-8")) as GeneratedForecastSitesFile;
  console.log(
    `check:forecast - ${sites.length} sites against met.no, next ${args.hours}h\n` +
      `forecast-sites.json generated ${generated.generatedAt}\n`,
  );

  const reports: SiteReport[] = [];
  for (const site of sites) {
    try {
      const theirs = await fetchMetNo(site);
      reports.push(compareSite(site, generated.sites[site.id], theirs, args.hours));
    } catch (err) {
      reports.push({
        siteId: site.id,
        name: site.name,
        hoursPublished: generated.sites[site.id]?.hours.length ?? 0,
        hoursMissing: 0,
        hoursCompared: 0,
        meanDeltaMs: null,
        maxDeltaMs: null,
        meanSignedDeltaMs: null,
        verdictSame: 0,
        tooOptimistic: 0,
        tooOptimisticFlyable: 0,
        tooOptimisticOverStrong: 0,
        tooPessimistic: 0,
        worstOptimistic: [],
        error: (err as Error).message,
      });
    }
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
  }

  console.log("site                        cmp  miss   mean±   signed    max   same  OPTIM  FLYBL STRONG   pess");
  console.log("-".repeat(98));
  for (const r of reports) {
    if (r.error) {
      console.log(`${r.siteId.padEnd(26)} ${r.error}`);
      continue;
    }
    console.log(
      `${r.siteId.padEnd(26)} ${String(r.hoursCompared).padStart(3)} ${String(r.hoursMissing).padStart(5)} ` +
        `${fmt(r.meanDeltaMs)} ${fmt(r.meanSignedDeltaMs)} ${fmt(r.maxDeltaMs)} ` +
        `${String(r.verdictSame).padStart(6)} ${String(r.tooOptimistic).padStart(6)} ` +
        `${String(r.tooOptimisticFlyable).padStart(6)} ${String(r.tooOptimisticOverStrong).padStart(6)} ` +
        `${String(r.tooPessimistic).padStart(6)}`,
    );
  }

  const ok = reports.filter((r) => !r.error);
  const totals = {
    sites: ok.length,
    hoursCompared: ok.reduce((a, r) => a + r.hoursCompared, 0),
    hoursMissing: ok.reduce((a, r) => a + r.hoursMissing, 0),
    verdictSame: ok.reduce((a, r) => a + r.verdictSame, 0),
    tooOptimistic: ok.reduce((a, r) => a + r.tooOptimistic, 0),
    tooOptimisticFlyable: ok.reduce((a, r) => a + r.tooOptimisticFlyable, 0),
    tooOptimisticOverStrong: ok.reduce((a, r) => a + r.tooOptimisticOverStrong, 0),
    tooPessimistic: ok.reduce((a, r) => a + r.tooPessimistic, 0),
    meanSignedDeltaMs: mean(ok.flatMap((r) => (r.meanSignedDeltaMs === null ? [] : [r.meanSignedDeltaMs]))),
  };

  console.log("-".repeat(98));
  console.log(
    `TOTAL                      ${String(totals.hoursCompared).padStart(3)} ${String(totals.hoursMissing).padStart(5)} ` +
      `        ${fmt(totals.meanSignedDeltaMs)}        ${String(totals.verdictSame).padStart(6)} ` +
      `${String(totals.tooOptimistic).padStart(6)} ${String(totals.tooOptimisticFlyable).padStart(6)} ${String(totals.tooOptimisticOverStrong).padStart(6)} ` +
      `${String(totals.tooPessimistic).padStart(6)}`,
  );
  console.log(
    `\nOPTIM  = Startvind shows a greener verdict than met.no.` +
      `\nFLYBL  = of those, the ones where met.no reads >= ${FLYABLE_SPEED_MS} m/s - wind somebody` +
      `\n         might launch in. The rest is direction noise at near-calm.` +
      `\nSTRONG = of those, the ones where met.no exceeds the site's OWN max wind or` +
      `\n         hard gust limit. THIS is the risk number: green shown on wind that is` +
      `\n         too strong, not merely too light. It has to be zero.` +
      `\nmiss   = hours published with no wind value in them at all.`,
  );

  const worst = ok
    .flatMap((r) => r.worstOptimistic.map((c) => ({ siteId: r.siteId, ...c })))
    .sort(
      (a, b) =>
        Number(b.theirs.speedMs >= FLYABLE_SPEED_MS) - Number(a.theirs.speedMs >= FLYABLE_SPEED_MS) ||
        a.deltaMs - b.deltaMs,
    )
    .slice(0, 10);
  if (worst.length > 0) {
    console.log(`\nWorst optimistic hours:`);
    for (const w of worst) {
      console.log(
        `  ${w.siteId.padEnd(22)} ${w.hourIso}  ours ${w.ours.speedMs!.toFixed(1)} (${w.ourState})` +
          `  met.no ${w.theirs.speedMs.toFixed(1)} (${w.theirState})`,
      );
    }
  }

  if (args.json) {
    const path = resolve(repoRoot, args.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ checkedAt: new Date().toISOString(), generatedAt: generated.generatedAt, totals, reports }, null, 2) + "\n",
      "utf-8",
    );
    console.log(`\nwrote ${path}`);
  }
}

main().catch((err) => {
  console.error(`check:forecast failed - ${(err as Error).message}`);
  process.exit(1);
});
