import { forecastHourMs } from "./forecastTime.ts";
import { leadHours, type ObservationRow } from "./observationLog.ts";
import { evaluateFlyability, type WindConfig } from "./flyability.ts";
import type { Sector } from "./siteFile.ts";
import type { RoseState } from "../components/WindRose/index.ts";

/**
 * Scoring the forecast against the anemometers - the arithmetic only.
 *
 * The recorder (scripts/record-observations.ts) has been keeping pairs of
 * "what we published" and "what the meter measured" since 2026-09-21
 * (docs/FORECAST_VERIFICATION.md). This module is the other half: it turns
 * those rows into the numbers a pilot can read - a per-site accuracy
 * figure, split by wind strength, by month and by forecast lead time.
 *
 * Pure: rows in, report out. No filesystem, no network, no clock beyond
 * what the caller passes. That is deliberate - it is the module the local
 * lab and, later, the shipping app both call, so what the lab proves is
 * what ships.
 *
 * Two rules carried from the rest of this repository, and they are the
 * point rather than a nicety:
 *
 *  - A figure is never reported as "confident" below a minimum sample
 *    size. A percentage computed from nine hours is worse than no
 *    percentage, because it looks like knowledge.
 *  - Direction is circular. 350deg and 10deg are 20deg apart, not 340deg,
 *    so directions are compared with an angular difference, never by
 *    subtracting one ordinary number from another.
 *
 * A score describes forecast-versus-station, never forecast-versus-launch:
 * the anemometer may sit a kilometre away on a different aspect and is
 * measuring its own wind. Callers must keep saying so.
 */

/** How close a forecast must be to count as a hit, for the headline figure. */
export interface AccuracyOptions {
  /** m/s. A forecast within this of the meter counts for the speed half. */
  speedToleranceMs: number;
  /** Degrees. Within this counts for the direction half. */
  directionToleranceDeg: number;
  /** Upper edges of the observed-wind bands, m/s, ascending. */
  bandEdgesMs: number[];
  /** Below this many hours, `confident` is false and the UI must say "collecting". */
  minSample: number;
}

export const DEFAULT_ACCURACY_OPTIONS: AccuracyOptions = {
  speedToleranceMs: 2,
  directionToleranceDeg: 30,
  bandEdgesMs: [3, 6, 9],
  minSample: 100,
};

export interface AccuracyStats {
  /** Hours behind every figure here. Never zero for a reported stat. */
  n: number;
  /** Mean signed forecast error, m/s. Negative means we read lower than the meter. */
  biasMs: number | null;
  /** Mean absolute error, m/s. */
  maeMs: number | null;
  /** Root-mean-square error, m/s. */
  rmseMs: number | null;
  /** Circular mean absolute direction error, degrees. */
  dirMaeDeg: number | null;
  /** Share of hours whose speed was within tolerance. */
  withinSpeedPct: number | null;
  /** Share of hours whose direction was within tolerance (rows with a known direction). */
  withinDirPct: number | null;
  /** The headline: share of hours within BOTH tolerances, out of all paired hours. */
  accuracyPct: number | null;
  /**
   * Share of judged hours where our GOOD/MAYBE/BAD matched the meter's.
   * Null when the site has no usable rules to judge with.
   */
  verdictAgreementPct: number | null;
  /** Hours where our verdict was greener than the meter's - the dangerous direction. */
  optimisticHours: number;
  /**
   * Of those, the hours where the meter was actually over the site's own
   * limit. This is the risk number, and it should be zero.
   */
  falseGreenOverLimitHours: number;
  /** Below minSample - a figure exists but must be shown as provisional. */
  confident: boolean;
}

export interface Stratum {
  label: string;
  stats: AccuracyStats;
}

export interface SiteAccuracy {
  siteId: string;
  name: string;
  hasStation: boolean;
  firstHour: string | null;
  lastHour: string | null;
  /** Share of rows whose observation could not prove its own measurement time. */
  ageUnconfirmedPct: number | null;
  overall: AccuracyStats;
  byBand: Stratum[];
  byMonth: Stratum[];
  byLead: Stratum[];
  /** Honest note for the UI, e.g. a stationless site. */
  note?: string;
}

export interface AccuracyReport {
  generatedAt: string;
  rowCount: number;
  sourceFiles: string[];
  options: AccuracyOptions;
  overall: AccuracyStats;
  sites: SiteAccuracy[];
  /**
   * Site ids with recorded rows that the current catalogue does not know -
   * a site renamed, archived or moved. Kept visible rather than dropped:
   * their history is real and should be re-attached, not silently lost.
   */
  unknownSites?: string[];
}

/** A site reduced to the fields scoring needs. */
export interface AccuracySite {
  id: string;
  name: string;
  sector: Sector | null;
  wind: WindConfig;
  hasStation: boolean;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(count: number, total: number): number | null {
  return total === 0 ? null : (count / total) * 100;
}

function round(n: number | null, digits = 1): number | null {
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Signed smallest angle from b to a, in (-180, 180]. */
export function angleDifferenceDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Unsigned angular distance between two bearings, 0..180. */
export function angularDistanceDeg(a: number, b: number): number {
  return Math.abs(angleDifferenceDeg(a, b));
}

const STATE_RANK: Record<RoseState, number> = { green: 3, orange: 2, red: 1, gray: 0 };

/** The meter was physically over the site's own configured limit. */
function meterOverLimit(site: AccuracySite, speedMs: number, gustMs: number | null): boolean {
  const max = site.wind.max_ms;
  const hardGust = site.wind.hard_max_gust_ms;
  if (max !== undefined && speedMs > max) return true;
  if (hardGust !== undefined && gustMs !== null && gustMs > hardGust) return true;
  return false;
}

/**
 * Every headline figure over one set of rows.
 *
 * Rows are expected to have both a real observed and a real forecast speed
 * (the recorder only stores complete pairs). Direction is optional on both
 * sides and is excluded, not guessed, when either is missing.
 */
export function computeAccuracyStats(
  rows: ObservationRow[],
  site: AccuracySite,
  options: AccuracyOptions = DEFAULT_ACCURACY_OPTIONS,
): AccuracyStats {
  const n = rows.length;

  const deltas = rows.map((r) => r.fc.ms - r.obs.ms);
  const bias = mean(deltas);
  const mae = mean(deltas.map(Math.abs));
  const rmse = deltas.length === 0 ? null : Math.sqrt(mean(deltas.map((d) => d * d))!);

  const withBothDeg = rows.filter((r) => r.obs.deg !== null && r.fc.deg !== null);
  const dirErrors = withBothDeg.map((r) => angularDistanceDeg(r.fc.deg!, r.obs.deg!));
  const dirMae = mean(dirErrors);

  const withinSpeed = rows.filter((r) => Math.abs(r.fc.ms - r.obs.ms) <= options.speedToleranceMs).length;
  const withinDir = dirErrors.filter((d) => d <= options.directionToleranceDeg).length;
  const withinBoth = rows.filter(
    (r) =>
      Math.abs(r.fc.ms - r.obs.ms) <= options.speedToleranceMs &&
      r.obs.deg !== null &&
      r.fc.deg !== null &&
      angularDistanceDeg(r.fc.deg, r.obs.deg) <= options.directionToleranceDeg,
  ).length;

  // Verdict comparison, mirroring scripts/check-forecast.ts so the two
  // tools cannot drift: a site turns red for too little wind as well as
  // too much, and only "too much" is a safety failure.
  let judged = 0;
  let same = 0;
  let optimistic = 0;
  let falseGreenOverLimit = 0;
  for (const r of rows) {
    const ours = evaluateFlyability(r.fc.deg, r.fc.ms, r.fc.gust, site.sector, site.wind);
    const theirs = evaluateFlyability(r.obs.deg, r.obs.ms, r.obs.gust, site.sector, site.wind);
    if (ours.state === "gray" || theirs.state === "gray") continue;
    judged += 1;
    if (ours.state === theirs.state) same += 1;
    if (STATE_RANK[ours.state] > STATE_RANK[theirs.state]) {
      optimistic += 1;
      if (meterOverLimit(site, r.obs.ms, r.obs.gust)) falseGreenOverLimit += 1;
    }
  }

  return {
    n,
    biasMs: round(bias, 2),
    maeMs: round(mae, 2),
    rmseMs: round(rmse, 2),
    dirMaeDeg: round(dirMae, 1),
    withinSpeedPct: round(pct(withinSpeed, n), 1),
    withinDirPct: round(pct(withinDir, withBothDeg.length), 1),
    accuracyPct: round(pct(withinBoth, n), 1),
    verdictAgreementPct: round(pct(same, judged), 1),
    optimisticHours: optimistic,
    falseGreenOverLimitHours: falseGreenOverLimit,
    confident: n >= options.minSample,
  };
}

/** "0–3", "3–6", … "9+" for an observed speed and ascending edges. */
export function bandLabel(speedMs: number, edges: number[]): string {
  for (let i = 0; i < edges.length; i += 1) {
    const lower = i === 0 ? 0 : edges[i - 1];
    if (speedMs < edges[i]) return `${lower}–${edges[i]}`;
  }
  return `${edges[edges.length - 1]}+`;
}

/** Buckets by how far ahead the forecast was issued. */
export function leadLabel(hours: number | null): string {
  if (hours === null) return "unknown";
  if (hours <= 1) return "nowcast (≤1h)";
  if (hours <= 6) return "1–6h";
  if (hours <= 24) return "6–24h";
  return ">24h";
}

const LEAD_ORDER = ["nowcast (≤1h)", "1–6h", "6–24h", ">24h", "unknown"];

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function strata(
  rows: ObservationRow[],
  site: AccuracySite,
  options: AccuracyOptions,
  key: (row: ObservationRow) => string,
  order: string[] | null,
): Stratum[] {
  const grouped = groupBy(rows, key);
  const labels = order ? order.filter((l) => grouped.has(l)) : [...grouped.keys()].sort();
  return labels.map((label) => ({
    label,
    stats: computeAccuracyStats(grouped.get(label)!, site, options),
  }));
}

/** Everything the UI needs for one site. */
export function summariseSite(
  rows: ObservationRow[],
  site: AccuracySite,
  options: AccuracyOptions = DEFAULT_ACCURACY_OPTIONS,
): SiteAccuracy {
  const hours = rows.map((r) => r.hour).sort((a, b) => forecastHourMs(a) - forecastHourMs(b));
  const ageUnconfirmed = rows.filter((r) => r.obs.ageConfirmed === false).length;

  const result: SiteAccuracy = {
    siteId: site.id,
    name: site.name,
    hasStation: site.hasStation,
    firstHour: hours[0] ?? null,
    lastHour: hours[hours.length - 1] ?? null,
    ageUnconfirmedPct: round(pct(ageUnconfirmed, rows.length), 1),
    overall: computeAccuracyStats(rows, site, options),
    byBand: strata(rows, site, options, (r) => bandLabel(r.obs.ms, options.bandEdgesMs), null),
    byMonth: strata(rows, site, options, (r) => r.hour.slice(0, 7), null),
    byLead: strata(rows, site, options, (r) => leadLabel(leadHours(r)), LEAD_ORDER),
  };

  if (!site.hasStation) {
    result.note = "No station attached - this site can never be scored.";
  } else if (rows.length === 0) {
    result.note = "Collecting - no measurements recorded yet.";
  } else if (!result.overall.confident) {
    result.note = `Collecting - ${rows.length} hours so far, ${options.minSample} needed before the figure is meaningful.`;
  }
  return result;
}

/** The whole picture: every site the catalogue knows, plus a pooled overall. */
export function summariseAccuracy(
  rows: ObservationRow[],
  sites: AccuracySite[],
  options: AccuracyOptions = DEFAULT_ACCURACY_OPTIONS,
  meta: { generatedAt: string; sourceFiles: string[] } = { generatedAt: new Date().toISOString(), sourceFiles: [] },
): AccuracyReport {
  const bySite = groupBy(rows, (r) => r.site);

  const siteReports = sites.map((site) => summariseSite(bySite.get(site.id) ?? [], site, options));

  // Rows whose site is not in the catalogue still count, so a renamed or
  // archived site's history is never silently dropped from the total.
  const pooled = [...rows];

  return {
    generatedAt: meta.generatedAt,
    rowCount: rows.length,
    sourceFiles: meta.sourceFiles,
    options,
    overall: computeAccuracyStats(pooled, pooledSite(sites), options),
    sites: siteReports,
  };
}

/**
 * A stand-in site for the pooled total, where no single sector applies.
 * Verdict metrics are therefore not produced across sites - only the
 * per-site rows carry meaning there.
 */
function pooledSite(sites: AccuracySite[]): AccuracySite {
  return {
    id: "(all)",
    name: "(all sites)",
    sector: null,
    wind: { verified: false },
    hasStation: sites.some((s) => s.hasStation),
  };
}
