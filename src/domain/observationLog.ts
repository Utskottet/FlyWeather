import { forecastHourMs, normaliseForecastHour } from "./forecastTime.ts";

/**
 * What the anemometer said, beside what the forecast said, for the same hour.
 *
 * This project reads seventeen live wind stations and throws every
 * reading away on the next collector run. Keeping them is the only way
 * to answer the question no test in this repository can:
 * not "is the code correct" but "is the number true".
 *
 * Two forecast bugs shipped undetected for months and were found by a
 * pilot comparing against YR in another tab, not by anything here
 * (docs/FORECAST_INTEGRITY.md). A row per site per hour, accumulated,
 * turns that into something the repository can notice by itself.
 *
 * Stored the same way as data/edit-log.jsonl and data/issues.jsonl: one
 * JSON object per line, appended, never rewritten. No database to
 * disagree with the repository, backed up by every clone, readable by
 * anyone, and revertable with one git command.
 *
 * Deliberately NOT a time series. Rows are independent pieces of
 * evidence - each one is a complete forecast-versus-measurement pair -
 * so irregular sampling costs nothing. That matters, because the only
 * free scheduler available here (GitHub Actions cron) honours a
 * five-minute schedule at two-to-five-hour intervals. For a month's or a
 * year's bias figure, when the samples landed is irrelevant; how many
 * there are is what counts.
 */

export interface ObservationRow {
  /** When this row was recorded. ISO-8601 UTC. */
  at: string;
  site: string;
  /** The forecast hour both sides describe, always zone-stamped. */
  hour: string;
  obs: {
    ms: number;
    /** Null for a genuinely variable wind (METAR VRB) - never invented. */
    deg: number | null;
    /** Missing stays missing: a station that reports no gust is not reporting zero. */
    gust: number | null;
    src: string;
    /**
     * False when the station publishes no usable measurement time, so the
     * reading is only roughly current - Holfuy's widget prints a bare
     * "HH:MM". Analysis must be able to exclude these rather than treat a
     * download time as a measurement time.
     */
    ageConfirmed: boolean;
  };
  fc: {
    ms: number;
    deg: number | null;
    gust: number | null;
    /**
     * When the forecast being compared was generated.
     *
     * Not decoration: `hour` minus this is the lead time, and without it
     * the file silently mixes forecasts issued minutes before the hour
     * with forecasts issued six hours before it. A bias figure computed
     * over that mixture measures two different things at once.
     *
     * It is not hypothetical. The first rows recorded on 2026-09-22 were
     * compared against a forecast that was already 6.5 hours old,
     * because Open-Meteo was rate-limiting the refresh job and the
     * collector was correctly republishing the last good file. Rows
     * written before this field existed simply lack it and are readable
     * as unknown lead.
     */
    issued?: string;
  };
}

/** How far an observation may sit from the forecast hour and still describe it. */
export const PAIRING_TOLERANCE_MINUTES = 30;

/**
 * Builds one row, or null when there is nothing worth storing.
 *
 * A row exists only when BOTH sides have a real wind speed for the same
 * hour. Half a pair cannot verify anything, and storing it would put
 * nulls into a file whose whole purpose is arithmetic later.
 */
export function buildObservationRow(input: {
  at: string;
  site: string;
  hour: string;
  observedAt: string;
  obsMs: number | null;
  obsDeg: number | null;
  obsGust: number | null;
  source: string;
  ageConfirmed: boolean;
  fcMs: number | null;
  fcDeg: number | null;
  fcGust: number | null;
  /** The forecast file's generatedAt, so lead time is recoverable. */
  fcIssued?: string;
}): ObservationRow | null {
  if (input.obsMs === null || input.fcMs === null) return null;

  // An observation taken well away from the hour it is paired with
  // describes different weather. Silently pairing them is exactly the
  // mistake that let a two-hour offset hide inside a 30-minute
  // tolerance once already.
  const drift = Math.abs(forecastHourMs(input.hour) - Date.parse(input.observedAt));
  if (!Number.isFinite(drift) || drift > PAIRING_TOLERANCE_MINUTES * 60_000) return null;

  return {
    at: input.at,
    site: input.site,
    hour: normaliseForecastHour(input.hour),
    obs: {
      ms: input.obsMs,
      deg: input.obsDeg,
      gust: input.obsGust,
      src: input.source,
      ageConfirmed: input.ageConfirmed,
    },
    fc: {
      ms: input.fcMs,
      deg: input.fcDeg,
      gust: input.fcGust,
      ...(input.fcIssued ? { issued: input.fcIssued } : {}),
    },
  };
}

/** Fixed key order, so the file diffs cleanly and a person can scan a column. */
export function serialiseObservation(row: ObservationRow): string {
  return JSON.stringify({
    at: row.at,
    site: row.site,
    hour: row.hour,
    obs: {
      ms: round2(row.obs.ms),
      deg: row.obs.deg === null ? null : round2(row.obs.deg),
      gust: row.obs.gust === null ? null : round2(row.obs.gust),
      src: row.obs.src,
      ageConfirmed: row.obs.ageConfirmed,
    },
    fc: {
      ms: round2(row.fc.ms),
      deg: row.fc.deg === null ? null : round2(row.fc.deg),
      gust: row.fc.gust === null ? null : round2(row.fc.gust),
      ...(row.fc.issued ? { issued: row.fc.issued } : {}),
    },
  });
}

/**
 * Two decimals is far finer than any anemometer's real accuracy, and is
 * here only so the file does not carry 9.166666666666668 on every line.
 * Nothing downstream should read this as precision.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Skips unreadable lines rather than throwing - one bad row must not lose a month. */
export function parseObservations(text: string | null | undefined): ObservationRow[] {
  if (!text) return [];
  const rows: ObservationRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as ObservationRow;
      if (
        typeof parsed.site === "string" &&
        typeof parsed.hour === "string" &&
        typeof parsed.obs?.ms === "number" &&
        typeof parsed.fc?.ms === "number"
      ) {
        rows.push(parsed);
      }
    } catch {
      // Left in the file for a person to look at rather than rewritten away.
    }
  }
  return rows;
}

/**
 * Which (site, hour) pairs the file already holds.
 *
 * The recorder runs on an unreliable schedule and two runs can land in
 * the same hour. Without this, a windy afternoon that happened to get
 * sampled twice would carry twice the weight of a calm one in every
 * average computed later - a quiet bias introduced by the scheduler
 * rather than by the weather.
 */
export function recordedKeys(rows: ObservationRow[]): Set<string> {
  return new Set(rows.map((r) => `${r.site}@${normaliseForecastHour(r.hour)}`));
}

export function observationKey(site: string, hour: string): string {
  return `${site}@${normaliseForecastHour(hour)}`;
}

/** Appends rows, always leaving the file newline-terminated. */
export function appendObservations(text: string | null | undefined, rows: ObservationRow[]): string {
  if (rows.length === 0) return text ?? "";
  const body = (text ?? "").replace(/\s*$/, "");
  const lines = rows.map(serialiseObservation).join("\n");
  return body === "" ? `${lines}\n` : `${body}\n${lines}\n`;
}

/** One file per month, so a year stays browsable and compaction is trivial later. */
export function monthFileName(at: string): string {
  const d = new Date(at);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}.jsonl`;
}

/**
 * How far ahead this forecast was predicting, in hours.
 *
 * Null when the row predates the `issued` field, which is the honest
 * answer rather than assuming zero - a stale forecast compared against a
 * fresh observation is a long-lead forecast, and calling that a nowcast
 * would flatter it.
 */
export function leadHours(row: ObservationRow): number | null {
  if (!row.fc.issued) return null;
  const issued = Date.parse(row.fc.issued);
  if (!Number.isFinite(issued)) return null;
  return (forecastHourMs(row.hour) - issued) / 3_600_000;
}
