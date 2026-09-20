import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { fetchSource } from "./sourceUrl.ts";
import { numeric, validGust, KNOTS_TO_MS } from "./parse.ts";

/**
 * Swedish airport observations (METAR), via the Aviation Weather Center's
 * public API.
 *
 * Worth having and worth caveating. An airport anemometer is well sited,
 * professionally maintained and reported to a standard - but a METAR is
 * issued on a schedule, typically hourly, sometimes only during operating
 * hours. It is not a live wind feed, and treating one as though it were
 * would make a two-o'clock reading look current at three. Hence the 90
 * minute staleness budget and the note travelling with every sample.
 *
 * Wind is reported in KNOTS. Everything downstream of here is m/s.
 */

const METAR_BASE = "https://aviationweather.gov/api/data/metar";

export function buildMetarUrl(icaoId: string): string {
  return `${METAR_BASE}?ids=${encodeURIComponent(icaoId)}&format=json`;
}

export interface MetarRow {
  icaoId?: string;
  obsTime?: number;
  wspd?: number | string | null;
  wdir?: number | string | null;
  wgst?: number | string | null;
  rawOb?: string;
}

/** 290 kt is past any surface observation; it catches a corrupt field, not a storm. */
const MAX_KNOTS = 290;

/**
 * One METAR row to a sample.
 *
 * `wdir: "VRB"` means the observer recorded the wind as variable - it was
 * genuinely shifting, and no single direction describes it. That is
 * information, not a gap, and it must not collapse to 0°: a rose pointing
 * confidently north would state the one thing the report specifically
 * declined to say. Direction stays null and `variableDirection` carries
 * the reason.
 */
export function parseMetar(row: MetarRow | undefined | null): Omit<WindSample, "sourceId" | "sourceKind" | "stationId"> {
  const speedKt = numeric(row?.wspd);
  const variable = row?.wdir === "VRB";
  const directionDeg = variable ? null : numeric(row?.wdir);
  const gustKt = numeric(row?.wgst);

  if (speedKt === null || speedKt < 0 || speedKt > MAX_KNOTS) {
    throw new Error("Airport report has no usable wind speed");
  }
  if (!variable && (directionDeg === null || directionDeg < 0 || directionDeg > 360)) {
    throw new Error("Airport report has no usable wind direction");
  }
  if (!Number.isFinite(row?.obsTime)) {
    // No observation time means no way to say how old it is, and an
    // airport report with an unknown age is worth very little.
    throw new Error("Airport report has no observation time");
  }

  const gustMs = gustKt === null || gustKt > MAX_KNOTS ? null : validGust(gustKt * KNOTS_TO_MS);

  return {
    timestamp: new Date(row!.obsTime! * 1000).toISOString(),
    windSpeedMs: speedKt * KNOTS_TO_MS,
    windDirectionDeg: directionDeg === null ? null : directionDeg % 360,
    variableDirection: variable,
    windGustMs: gustMs,
    quality: "good",
    staleAfterMinutes: 90,
    note: `Airport METAR observation; reporting intervals vary, so this is not continuous live wind.${
      row?.rawOb ? ` ${row.rawOb}` : ""
    }`,
  };
}

export const metarProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    if (!source.station_id) return [];
    const icao = source.station_id.trim().toUpperCase();
    if (!/^ES[A-Z]{2}$/.test(icao)) return [];

    const rows = (await fetchSource(buildMetarUrl(icao))) as MetarRow[];
    if (!Array.isArray(rows)) return [];
    // Newest first - the endpoint can return several reports for one field.
    const latest = rows
      .filter((r) => r.icaoId === icao)
      .sort((a, b) => (b.obsTime ?? 0) - (a.obsTime ?? 0))[0];
    if (!latest) return [];

    return [{ sourceId: "metar", sourceKind: "observation", stationId: icao, ...parseMetar(latest) }];
  },
};
