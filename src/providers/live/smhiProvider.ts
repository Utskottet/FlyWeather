import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { fetchSource } from "./sourceUrl.ts";
import { numeric, validGust, validWind } from "./parse.ts";

/**
 * SMHI's open metobs API - the national weather service's own published
 * station observations, unauthenticated and documented.
 *
 * Two families of wind station, which matter because they are not the
 * same product:
 *
 *  - parameters 47/48: one-minute mean speed and direction. Near-live.
 *  - parameters 4/3: ten-minute mean, reported once an hour. Perfectly
 *    good data, but an hour old is normal for it, not a fault.
 *
 * The station record says which it is, so freshness is judged against
 * what that station actually promises rather than one threshold applied
 * to both.
 *
 * Gusts (parameter 21) are an HOURLY MAXIMUM with their own timestamp -
 * the strongest gust of a past period, published separately. It is
 * carried as a `gustReport` beside the sample rather than as the sample's
 * own gust, because calling it "the gust right now" would be a confident
 * little lie about a number pilots use to decide whether to fly.
 */

const SMHI_BASE = "https://opendata-download-metobs.smhi.se/api/version/1.0";

export const SMHI_PARAM_SPEED_1MIN = 47;
export const SMHI_PARAM_DIRECTION_1MIN = 48;
export const SMHI_PARAM_SPEED_HOURLY = 4;
export const SMHI_PARAM_DIRECTION_HOURLY = 3;
export const SMHI_PARAM_GUST = 21;

export function buildSmhiUrl(parameter: number, stationId: string): string {
  return `${SMHI_BASE}/parameter/${parameter}/station/${stationId}/period/latest-hour/data.json`;
}

interface SmhiValue {
  date: number;
  value: string | number | null;
  quality?: string;
}

interface SmhiSeries {
  value?: SmhiValue[] | null;
}

export interface SmhiStationHints {
  /** 1 for the one-minute product, 60 for the hourly ten-minute mean. */
  intervalMinutes: number;
}

/**
 * Pairs speed with the direction reported at the SAME instant.
 *
 * Deliberately a map lookup on the timestamp rather than "take the latest
 * of each": the two series can be one reading out of step, and combining
 * a speed from 14:05 with a direction from 14:04 invents a wind that was
 * never observed. If no timestamp carries both, there is no reading.
 */
export function parseSmhi(
  speedSeries: SmhiSeries,
  directionSeries: SmhiSeries,
  hints: SmhiStationHints,
  gustSeries: SmhiSeries | null = null,
): Omit<WindSample, "sourceId" | "sourceKind" | "stationId"> {
  const directions = new Map((directionSeries.value ?? []).map((v) => [v.date, v]));
  const speeds = [...(speedSeries.value ?? [])].sort((a, b) => b.date - a.date);

  for (const reading of speeds) {
    const direction = directions.get(reading.date);
    const speedMs = numeric(reading.value);
    const directionDeg = numeric(direction?.value);
    if (!validWind(speedMs, directionDeg) || !Number.isFinite(reading.date)) continue;

    // Only gusts recorded at or before this wind reading, so the report
    // can never describe a period that had not happened yet.
    const gust = [...(gustSeries?.value ?? [])]
      .filter((v) => validGust(numeric(v.value)) !== null && v.date <= reading.date && v.quality === "G")
      .sort((a, b) => b.date - a.date)[0];

    const oneMinute = hints.intervalMinutes === 1;
    return {
      timestamp: new Date(reading.date).toISOString(),
      windSpeedMs: speedMs,
      windDirectionDeg: directionDeg! % 360,
      // Not the hourly maximum - see the module comment.
      windGustMs: null,
      gustReport: gust
        ? {
            windGustMs: numeric(gust.value)!,
            timestamp: new Date(gust.date).toISOString(),
            label: "Hourly gust maximum (separate report)",
          }
        : null,
      quality: reading.quality === "G" && direction?.quality === "G" ? "good" : "suspect",
      staleAfterMinutes: oneMinute ? 15 : 90,
      note: oneMinute
        ? "One-minute mean. Gust, when available, is a separate hourly report."
        : "Ten-minute mean, reported hourly.",
    };
  }

  throw new Error("No SMHI timestamp carries both a valid wind speed and direction");
}

/**
 * Which parameter pair a station publishes.
 *
 * Saved on the station record by the finder (as `smhi:<id>@1` or `@60`),
 * because asking SMHI would cost two directory fetches per site on every
 * collection run. An unsuffixed id falls back to trying the one-minute
 * product first, which is what the finder prefers anyway.
 */
export function parseSmhiStationId(stationId: string): { id: string; intervalMinutes: number } {
  const match = /^(\d+)(?:@(\d+))?$/.exec(stationId.trim());
  if (!match) throw new Error(`Not an SMHI station id: ${stationId}`);
  return { id: match[1], intervalMinutes: match[2] === "60" ? 60 : 1 };
}

async function seriesOrNull(parameter: number, stationId: string): Promise<SmhiSeries | null> {
  try {
    return (await fetchSource(buildSmhiUrl(parameter, stationId))) as SmhiSeries;
  } catch {
    return null;
  }
}

export const smhiProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    if (!source.station_id) return [];
    const { id, intervalMinutes } = parseSmhiStationId(source.station_id);
    const speedParam = intervalMinutes === 1 ? SMHI_PARAM_SPEED_1MIN : SMHI_PARAM_SPEED_HOURLY;
    const directionParam = intervalMinutes === 1 ? SMHI_PARAM_DIRECTION_1MIN : SMHI_PARAM_DIRECTION_HOURLY;

    const [speed, direction, gust] = await Promise.all([
      seriesOrNull(speedParam, id),
      seriesOrNull(directionParam, id),
      seriesOrNull(SMHI_PARAM_GUST, id),
    ]);
    if (!speed || !direction) return [];

    const parsed = parseSmhi(speed, direction, { intervalMinutes }, gust);
    return [{ sourceId: "smhi", sourceKind: "observation", stationId: source.station_id, ...parsed }];
  },
};
