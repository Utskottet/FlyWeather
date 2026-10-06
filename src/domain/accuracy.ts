import { forecastHourMs } from "./forecastTime.ts";
import { leadHours, type ObservationRow } from "./observationLog.ts";
import { evaluateFlyability, type WindConfig } from "./flyability.ts";
import type { Sector } from "./siteFile.ts";
import type { RoseState } from "../components/WindRose/index.ts";

/**
 * Scoring the forecast against the anemometers - the arithmetic only.
 *
 * The recorder (scripts/record-observations.ts) keeps pairs of "what we
 * published" and "what the meter measured" (docs/FORECAST_VERIFICATION.md).
 * This module turns those rows into a per-site accuracy figure, split by
 * wind strength, month and lead time, plus an honest statement of how
 * much it can be trusted.
 *
 * Pure: rows in, report out. The local lab and, later, the shipping app
 * both call it, so what the lab proves is what ships.
 *
 * ---------------------------------------------------------------------
 * The method, fixed v1 (see TODO_ACCURACY_REPORT.md §14), and the three
 * decisions inside it that the first week of real data forced:
 *
 * 1. Direction is only scored above a wind threshold. Below ~3 m/s the
 *    direction is physically meaningless - a cup anemometer barely turns
 *    and the model is guessing. Scoring it there drags a site's number
 *    down for hours nobody flies. Speed is still scored at every wind.
 *
 * 2. The headline is the accuracy *in launchable wind* - the share of
 *    hours at or above the direction threshold within BOTH tolerances.
 *    Light-wind hours are still recorded, still counted for speed, and
 *    still shown as their own band; they are simply not in the headline
 *    denominator.
 *
 * 3. A score is only as good as the station it is measured against, so
 *    each site carries a reference-quality verdict. A station 30 km away
 *    or shared with another site is not evidence about this site.
 *
 * A score describes forecast-versus-station, never forecast-versus-launch.
 * ---------------------------------------------------------------------
 */

/** How close a forecast must be to count as a hit. */
export interface AccuracyOptions {
  /** m/s. A forecast within this of the meter counts for the speed half. */
  speedToleranceMs: number;
  /** Degrees. Within this counts for the direction half. */
  directionToleranceDeg: number;
  /** Upper edges of the observed-wind bands, m/s, ascending. */
  bandEdgesMs: number[];
  /** Below this many paired hours a figure is provisional. */
  minSample: number;
  /**
   * Below this many *launchable* hours, the headline is not shown at all.
   *
   * A percentage from two windy hours is worse than no percentage: it
   * looks like a result. This is a floor against absurdity, not a
   * confidence threshold - the confidence gate is minSample.
   */
  minLaunchableSample: number;
  /**
   * Observed wind (m/s) at or above which direction is scored.
   *
   * 3 m/s is the knee of the measured error curve: direction agreement
   * runs 42% (0-1 m/s), 63% (1-2), 71% (2-3), then jumps to 81% at 3-4
   * and flattens at 90%+ above 4. It also matches the meteorological
   * convention that direction is "variable" below ~3 m/s. A site with a
   * verified higher minimum raises this - see directionCutoffMs.
   */
  directionMinObsMs: number;
}

export const DEFAULT_ACCURACY_OPTIONS: AccuracyOptions = {
  speedToleranceMs: 2,
  directionToleranceDeg: 30,
  bandEdgesMs: [3, 6, 9],
  minSample: 100,
  minLaunchableSample: 10,
  directionMinObsMs: 3,
};

/** How good the station behind a site is as evidence about that site. */
export type ReferenceQuality = "good" | "provisional" | "unusable";

/** A station as the scoring needs to know it. */
export interface StationRef {
  provider: string;
  stationId: string | null;
  verified: boolean;
  /** Distance from the site, km. Null when unknown - not zero. */
  distanceKm: number | null;
}

/** A verified station within this distance is treated as a good reference. */
export const REFERENCE_MAX_GOOD_KM = 5;
/** Beyond this the station is not evidence about the site at all. */
export const REFERENCE_MAX_USABLE_KM = 15;

export interface AccuracyStats {
  /** All paired hours behind this figure. */
  n: number;
  /** Distinct UTC days - a stabler denominator than hours. */
  days: number;
  /** Hours at or above the direction cutoff: the headline denominator. */
  directionN: number;
  /** Mean signed forecast error over all hours, m/s. Negative = we read low. */
  biasMs: number | null;
  /** Mean absolute error over all hours, m/s. */
  maeMs: number | null;
  /** Median absolute error - robust to a single bad pairing. */
  medianAbsErrMs: number | null;
  /** Root-mean-square error over all hours, m/s. */
  rmseMs: number | null;
  /** Signed circular direction bias, degrees. Positive = we read clockwise. */
  dirBiasDeg: number | null;
  /** Circular mean absolute direction error over launchable hours, degrees. */
  dirMaeDeg: number | null;
  /** Share of ALL hours whose speed was within tolerance. */
  withinSpeedPct: number | null;
  /** Share of launchable hours whose direction was within tolerance. */
  withinDirPct: number | null;
  /** Headline: share of launchable hours within BOTH tolerances. */
  accuracyPct: number | null;
  /** Share of judged hours where our verdict matched the meter's. */
  verdictAgreementPct: number | null;
  /** Hours we judged greener than the meter - the dangerous direction. */
  optimisticHours: number;
  /** Of those, hours the meter was over the site's own limit. Should be zero. */
  falseGreenOverLimitHours: number;
  /** Enough launchable hours for the headline to be shown at all. */
  launchableConfident: boolean;
  /** False below minSample - a figure exists but must be shown as provisional. */
  confident: boolean;
}

/** How stable the figure is across the recording period (first vs second half). */
export interface Stability {
  firstHalfAccuracyPct: number | null;
  secondHalfAccuracyPct: number | null;
  /** second minus first, percentage points. Null when either half is empty. */
  deltaPct: number | null;
  firstHalfN: number;
  secondHalfN: number;
}

export interface Stratum {
  label: string;
  stats: AccuracyStats;
}

export interface SiteAccuracy {
  siteId: string;
  name: string;
  hasStation: boolean;
  station: StationRef | null;
  referenceQuality: ReferenceQuality;
  /** Why the reference is not "good", for the UI. */
  referenceNote?: string;
  firstHour: string | null;
  lastHour: string | null;
  /** Share of rows whose observation could not prove its own measurement time. */
  ageUnconfirmedPct: number | null;
  stability: Stability;
  overall: AccuracyStats;
  byBand: Stratum[];
  byMonth: Stratum[];
  byLead: Stratum[];
  /** What the effective direction cutoff was for this site. */
  directionCutoffMs: number;
  /** Honest note for the UI, e.g. a stationless or unusable-reference site. */
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
   * renamed, archived or moved. Kept visible rather than dropped.
   */
  unknownSites?: string[];
}

/** A site reduced to the fields scoring needs. */
export interface AccuracySite {
  id: string;
  name: string;
  sector: Sector | null;
  wind: WindConfig;
  station: StationRef | null;
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

/**
 * The mean of a set of signed angles, the circular way - averaging
 * degrees arithmetically is meaningless across north.
 */
export function circularMeanDeg(degs: number[]): number | null {
  if (degs.length === 0) return null;
  let sin = 0;
  let cos = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sin += Math.sin(r);
    cos += Math.cos(r);
  }
  return (Math.atan2(sin / degs.length, cos / degs.length) * 180) / Math.PI;
}

const STATE_RANK: Record<RoseState, number> = { green: 3, orange: 2, red: 1, gray: 0 };

/**
 * The observed wind at or above which this site's direction is scored.
 *
 * The global floor is directionMinObsMs. A site with a *verified* higher
 * minimum wind raises it, because hours below a site's own usable minimum
 * are not flown - and an unverified minimum is not trusted to raise it.
 */
export function directionCutoffMs(site: AccuracySite, options: AccuracyOptions): number {
  const authored = site.wind.verified ? (site.wind.min_ms ?? 0) : 0;
  return Math.max(options.directionMinObsMs, authored);
}

function meterOverLimit(site: AccuracySite, speedMs: number, gustMs: number | null): boolean {
  const max = site.wind.max_ms;
  const hardGust = site.wind.hard_max_gust_ms;
  if (max !== undefined && speedMs > max) return true;
  if (hardGust !== undefined && gustMs !== null && gustMs > hardGust) return true;
  return false;
}

/** Every headline figure over one set of rows. */
export function computeAccuracyStats(
  rows: ObservationRow[],
  site: AccuracySite,
  options: AccuracyOptions = DEFAULT_ACCURACY_OPTIONS,
): AccuracyStats {
  const n = rows.length;
  const days = new Set(rows.map((r) => r.hour.slice(0, 10))).size;
  const cutoff = directionCutoffMs(site, options);

  const deltas = rows.map((r) => r.fc.ms - r.obs.ms);
  const absSorted = deltas.map(Math.abs).sort((a, b) => a - b);
  const bias = mean(deltas);
  const mae = mean(deltas.map(Math.abs));
  const medianAbs = absSorted.length === 0 ? null : absSorted[Math.floor(absSorted.length / 2)];
  const rmse = deltas.length === 0 ? null : Math.sqrt(mean(deltas.map((d) => d * d))!);

  // Launchable = the meter reads at least the cutoff. Direction is only
  // meaningful here; speed is compared everywhere.
  const launchable = rows.filter((r) => r.obs.ms >= cutoff);
  const dirRows = launchable.filter((r) => r.obs.deg !== null && r.fc.deg !== null);
  const dirErrors = dirRows.map((r) => angularDistanceDeg(r.fc.deg!, r.obs.deg!));
  const dirSigned = dirRows.map((r) => angleDifferenceDeg(r.fc.deg!, r.obs.deg!));

  const withinSpeed = rows.filter((r) => Math.abs(r.fc.ms - r.obs.ms) <= options.speedToleranceMs).length;
  const withinDir = dirRows.filter((d) => angularDistanceDeg(d.fc.deg!, d.obs.deg!) <= options.directionToleranceDeg).length;
  const withinBoth = launchable.filter(
    (r) =>
      Math.abs(r.fc.ms - r.obs.ms) <= options.speedToleranceMs &&
      r.obs.deg !== null &&
      r.fc.deg !== null &&
      angularDistanceDeg(r.fc.deg, r.obs.deg) <= options.directionToleranceDeg,
  ).length;

  let judged = 0;
  let same = 0;
  let optimistic = 0;
  let falseGreen = 0;
  for (const r of rows) {
    const ours = evaluateFlyability(r.fc.deg, r.fc.ms, r.fc.gust, site.sector, site.wind);
    const theirs = evaluateFlyability(r.obs.deg, r.obs.ms, r.obs.gust, site.sector, site.wind);
    if (ours.state === "gray" || theirs.state === "gray") continue;
    judged += 1;
    if (ours.state === theirs.state) same += 1;
    if (STATE_RANK[ours.state] > STATE_RANK[theirs.state]) {
      optimistic += 1;
      if (meterOverLimit(site, r.obs.ms, r.obs.gust)) falseGreen += 1;
    }
  }

  return {
    n,
    days,
    directionN: launchable.length,
    biasMs: round(bias, 2),
    maeMs: round(mae, 2),
    medianAbsErrMs: round(medianAbs, 2),
    rmseMs: round(rmse, 2),
    dirBiasDeg: round(circularMeanDeg(dirSigned), 1),
    dirMaeDeg: round(mean(dirErrors), 1),
    withinSpeedPct: round(pct(withinSpeed, n), 1),
    withinDirPct: round(pct(withinDir, launchable.length), 1),
    accuracyPct: round(pct(withinBoth, launchable.length), 1),
    verdictAgreementPct: round(pct(same, judged), 1),
    optimisticHours: optimistic,
    falseGreenOverLimitHours: falseGreen,
    launchableConfident: launchable.length >= options.minLaunchableSample,
    confident: n >= options.minSample && launchable.length >= options.minLaunchableSample,
  };
}

/** "0-3", "3-6", ... "9+" for an observed speed and ascending edges. */
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

/** Station identity, so the same instrument attached to two sites is visible. */
export function stationKey(station: StationRef): string {
  return `${station.provider}:${station.stationId ?? station.provider}`;
}

/**
 * Is this station evidence about this site at all?
 *
 * Unusable: no station, a station shared with another site (the same
 * instrument cannot be the local truth for two ridges), or one beyond
 * REFERENCE_MAX_USABLE_KM. Provisional: unverified, or beyond
 * REFERENCE_MAX_GOOD_KM, or of unknown distance. Good: verified and close.
 */
export function referenceQuality(site: AccuracySite, duplicateStationKeys: ReadonlySet<string> = new Set()): ReferenceQuality {
  const st = site.station;
  if (!st) return "unusable";
  // A shared station is a data error to resolve, not proof either site is
  // wrong - distance usually shows which. Provisional, with a loud note,
  // so the legitimate site is not punished for the mistake.
  if (duplicateStationKeys.has(stationKey(st))) return "provisional";
  if (st.distanceKm !== null && st.distanceKm > REFERENCE_MAX_USABLE_KM) return "unusable";
  if (!st.verified) return "provisional";
  if (st.distanceKm === null || st.distanceKm > REFERENCE_MAX_GOOD_KM) return "provisional";
  return "good";
}

function referenceReason(site: AccuracySite, duplicateStationKeys: ReadonlySet<string>, quality: ReferenceQuality): string | undefined {
  const st = site.station;
  if (!st) return "No station attached - this site cannot be scored.";
  if (duplicateStationKeys.has(stationKey(st))) {
    return `Station ${st.provider} ${st.stationId ?? ""} is also attached to another site - the same instrument cannot be the local truth for both.`;
  }
  if (st.distanceKm !== null && st.distanceKm > REFERENCE_MAX_USABLE_KM) {
    return `Station is ${st.distanceKm} km away - too far to be evidence about this site.`;
  }
  if (quality === "provisional" && !st.verified) {
    return `Station ${st.provider} ${st.stationId ?? ""} is not verified, and its suitability for this site has not been checked.`;
  }
  if (quality === "provisional") {
    return st.distanceKm === null
      ? "Station distance is unknown."
      : `Station is ${st.distanceKm} km away - usable, but treat the score as provisional.`;
  }
  return undefined;
}

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

/** First half of the period versus the second, chronologically. */
function stabilityOf(rows: ObservationRow[], site: AccuracySite, options: AccuracyOptions): Stability {
  const sorted = [...rows].sort((a, b) => forecastHourMs(a.hour) - forecastHourMs(b.hour));
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid);
  const second = sorted.slice(mid);
  const a = computeAccuracyStats(first, site, options).accuracyPct;
  const b = computeAccuracyStats(second, site, options).accuracyPct;
  return {
    firstHalfAccuracyPct: a,
    secondHalfAccuracyPct: b,
    deltaPct: a === null || b === null ? null : round(b - a, 1),
    firstHalfN: first.length,
    secondHalfN: second.length,
  };
}

/** Everything the UI needs for one site. */
export function summariseSite(
  rows: ObservationRow[],
  site: AccuracySite,
  options: AccuracyOptions = DEFAULT_ACCURACY_OPTIONS,
  duplicateStationKeys: ReadonlySet<string> = new Set(),
): SiteAccuracy {
  const hours = rows.map((r) => r.hour).sort((a, b) => forecastHourMs(a) - forecastHourMs(b));
  const ageUnconfirmed = rows.filter((r) => r.obs.ageConfirmed === false).length;
  const quality = referenceQuality(site, duplicateStationKeys);

  const result: SiteAccuracy = {
    siteId: site.id,
    name: site.name,
    hasStation: site.hasStation,
    station: site.station,
    referenceQuality: quality,
    firstHour: hours[0] ?? null,
    lastHour: hours[hours.length - 1] ?? null,
    ageUnconfirmedPct: round(pct(ageUnconfirmed, rows.length), 1),
    stability: stabilityOf(rows, site, options),
    overall: computeAccuracyStats(rows, site, options),
    byBand: strata(rows, site, options, (r) => bandLabel(r.obs.ms, options.bandEdgesMs), null),
    byMonth: strata(rows, site, options, (r) => r.hour.slice(0, 7), null),
    byLead: strata(rows, site, options, (r) => leadLabel(leadHours(r)), LEAD_ORDER),
    directionCutoffMs: directionCutoffMs(site, options),
  };

  const reason = referenceReason(site, duplicateStationKeys, quality);
  if (reason) result.referenceNote = reason;

  if (quality === "unusable") {
    result.note = reason ?? "Reference station is unusable - this site cannot be scored.";
  } else if (rows.length === 0) {
    result.note = "Collecting - no measurements recorded yet.";
  } else if (!result.overall.confident) {
    result.note = `Collecting - ${rows.length} hours so far, ${options.minSample} needed before the figure is established.`;
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

  // The same instrument attached to two sites is a data error, not two
  // references - detect it before scoring either.
  const counts = new Map<string, number>();
  for (const s of sites) {
    if (s.station) {
      const k = stationKey(s.station);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const duplicates = new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));

  const siteReports = sites.map((site) => summariseSite(bySite.get(site.id) ?? [], site, options, duplicates));

  return {
    generatedAt: meta.generatedAt,
    rowCount: rows.length,
    sourceFiles: meta.sourceFiles,
    options,
    overall: computeAccuracyStats(rows, pooledSite(sites), options),
    sites: siteReports,
  };
}

/** A stand-in site for the pooled total, where no single sector applies. */
function pooledSite(sites: AccuracySite[]): AccuracySite {
  return {
    id: "(all)",
    name: "(all sites)",
    sector: null,
    wind: { verified: false },
    station: null,
    hasStation: sites.some((s) => s.hasStation),
  };
}
