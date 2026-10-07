import { forecastHourMs, normaliseForecastHour } from "./forecastTime.ts";
import { monthFileName, type ObservationRow } from "./observationLog.ts";

/**
 * What the forecast said FOR A FUTURE HOUR, kept so it can be checked later.
 *
 * The observation recorder (scripts/record-observations.ts) only ever
 * compares the forecast for the hour that is happening *now* - a nowcast.
 * That answers "is the number on screen true?", which is what caught the
 * 2026-09 bugs, but it cannot answer the question a pilot planning a trip
 * actually has: is Saturday's forecast worth trusting on Wednesday?
 *
 * So each run also writes down, for the same site, what the published
 * forecast says for +6/+12/+24/+48 hours. When those hours arrive, the
 * observation for them already exists, and the two are joined into a pair
 * at a known lead time. That is the vertical axis of the accuracy table.
 *
 * Append-only, one JSON object per line, exactly like the observation log
 * and for the same reasons: the repository is the database.
 *
 * `leadHours` is the REAL lead, target minus the forecast file's issue
 * time - not the nominal offset. When Open-Meteo rate-limits the refresh
 * job the published file is stale, so a forecast nominally "for +6h" can
 * really be a 16-hour forecast, and calling it +6 would flatter it.
 */

/** The offsets a run tries to record. Whatever falls inside the published horizon. */
export const LEAD_OFFSETS_H = [6, 12, 24, 48] as const;

export type LeadBucket = "≤1h" | "≈6h" | "≈12h" | "≈24h" | "≈48h" | ">60h";

export const LEAD_BUCKET_ORDER: LeadBucket[] = ["≤1h", "≈6h", "≈12h", "≈24h", "≈48h", ">60h"];

/**
 * Which column of the accuracy table a lead belongs to.
 *
 * The boundaries are the midpoints between the recorded offsets (6, 12, 24,
 * 48), not the offsets themselves, because a nominal "+48h" almost never
 * lands on exactly 48.0: the target is the nearest whole hour and the
 * forecast was issued a little earlier, so it lands around 47.5-48.5. Using
 * 48 as a boundary would scatter one column across two.
 */
export function leadBucket(hours: number): LeadBucket {
  if (hours <= 1) return "≤1h";
  if (hours <= 9) return "≈6h";
  if (hours <= 18) return "≈12h";
  if (hours <= 36) return "≈24h";
  if (hours <= 60) return "≈48h";
  return ">60h";
}

export interface LeadForecastRecord {
  /** When this record was written. ISO-8601 UTC. */
  at: string;
  site: string;
  /** The hour the forecast is FOR, always zone-stamped. */
  target: string;
  /** Real lead: target minus issue time, hours. */
  leadHours: number;
  /** The forecast file's generatedAt. */
  issued: string;
  ms: number;
  deg: number | null;
  gust: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Builds one record, or null when there is no usable wind speed. */
export function buildLeadRecord(input: {
  at: string;
  site: string;
  target: string;
  issued: string;
  ms: number | null;
  deg: number | null;
  gust: number | null;
}): LeadForecastRecord | null {
  if (input.ms === null) return null;
  const lead = (forecastHourMs(input.target) - Date.parse(input.issued)) / 3_600_000;
  if (!Number.isFinite(lead) || lead < 0) return null;
  return {
    at: input.at,
    site: input.site,
    target: normaliseForecastHour(input.target),
    leadHours: Math.round(lead * 10) / 10,
    issued: input.issued,
    ms: input.ms,
    deg: input.deg,
    gust: input.gust,
  };
}

/** Fixed key order, so the file diffs cleanly. */
export function serialiseLeadRecord(r: LeadForecastRecord): string {
  return JSON.stringify({
    at: r.at,
    site: r.site,
    target: normaliseForecastHour(r.target),
    leadHours: r.leadHours,
    issued: r.issued,
    ms: round2(r.ms),
    deg: r.deg === null ? null : round2(r.deg),
    gust: r.gust === null ? null : round2(r.gust),
  });
}

/** Skips unreadable lines rather than losing a month to one bad row. */
export function parseLeadForecasts(text: string | null | undefined): LeadForecastRecord[] {
  if (!text) return [];
  const rows: LeadForecastRecord[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as LeadForecastRecord;
      if (
        typeof parsed.site === "string" &&
        typeof parsed.target === "string" &&
        typeof parsed.ms === "number" &&
        typeof parsed.leadHours === "number"
      ) {
        rows.push(parsed);
      }
    } catch {
      // Left in the file for a person to look at.
    }
  }
  return rows;
}

/**
 * One prediction per (site, target hour, lead column).
 *
 * Two runs a few hours apart can both write a forecast for the same hour
 * inside the same column; keeping both would give that hour double weight
 * and make the column look better sampled than it is.
 */
export function leadRecordKey(r: LeadForecastRecord): string {
  return `${r.site}@${normaliseForecastHour(r.target)}@${leadBucket(r.leadHours)}`;
}

export function recordedLeadKeys(rows: LeadForecastRecord[]): Set<string> {
  return new Set(rows.map(leadRecordKey));
}

/** Appends rows, always newline-terminated. */
export function appendLeadRecords(text: string | null | undefined, rows: LeadForecastRecord[]): string {
  if (rows.length === 0) return text ?? "";
  const body = (text ?? "").replace(/\s*$/, "");
  const lines = rows.map(serialiseLeadRecord).join("\n");
  return body === "" ? `${lines}\n` : `${body}\n${lines}\n`;
}

/**
 * Turns recorded future forecasts into verification pairs, by joining each
 * one with the observation for the hour it predicted.
 *
 * Returns synthetic observation rows - the same shape everything else in
 * the analysis already consumes - where `fc.issued` is the forecast's real
 * issue time, so the existing lead calculation reads the true lead.
 * A lead record with no observation yet simply produces nothing; it will
 * pair on a later run once the hour has happened.
 */
export function joinLeadPairs(
  observations: ObservationRow[],
  leads: LeadForecastRecord[],
): ObservationRow[] {
  const obsIndex = new Map<string, ObservationRow>();
  for (const o of observations) obsIndex.set(`${o.site}@${normaliseForecastHour(o.hour)}`, o);

  const out: ObservationRow[] = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const o = obsIndex.get(`${l.site}@${normaliseForecastHour(l.target)}`);
    if (!o) continue;
    const key = leadRecordKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      at: l.at,
      site: l.site,
      hour: normaliseForecastHour(l.target),
      obs: o.obs,
      fc: { ms: l.ms, deg: l.deg, gust: l.gust, issued: l.issued },
    });
  }
  return out;
}

export { monthFileName };
