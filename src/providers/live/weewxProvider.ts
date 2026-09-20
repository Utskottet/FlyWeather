import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { fetchSource } from "./sourceUrl.ts";
import { numeric, validGust, validWind, KMH_TO_MS, KNOTS_TO_MS, MPH_TO_MS } from "./parse.ts";

/**
 * Club-operated WeeWX stations published through a Belchertown skin -
 * the `weewx_data.json` a club's own weather page reads.
 *
 * The one source here with no directory behind it. There is no national
 * list of club weather stations to look an id up in, so the feed URL *is*
 * the identity, which is why the station record has to carry a URL at all
 * (see types.ts) and why every such host is added to the allowlist by
 * hand after somebody has actually looked at it.
 *
 * Also the one source where the numbers come with their unit written next
 * to them, as text, in whatever the club configured: "4.2 m/s", "8 knop",
 * "14,5 km/h". So the unit is parsed rather than assumed - assuming m/s
 * would silently under-report a station configured in knots by a factor
 * of two, which is the difference between a green rose and a red one.
 *
 * Tested against Sjöbo flying club's ESMI feed.
 */

/** Swedish and English spellings, since the skin is localised by the club. */
const UNIT_FACTORS: Record<string, number> = {
  "m/s": 1,
  "km/h": KMH_TO_MS,
  kmh: KMH_TO_MS,
  mph: MPH_TO_MS,
  knop: KNOTS_TO_MS,
  knot: KNOTS_TO_MS,
  knots: KNOTS_TO_MS,
  kt: KNOTS_TO_MS,
  kts: KNOTS_TO_MS,
};

export interface BelchertownData {
  current?: {
    windspeed?: unknown;
    winddir_formatted?: unknown;
    windGust?: unknown;
    datetime_raw?: unknown;
  };
  station?: { latitude_dd?: unknown; longitude_dd?: unknown };
}

/**
 * "12,5 km/h" -> m/s. Returns null for anything whose unit is not
 * recognised, rather than treating the bare number as m/s - an unknown
 * unit is unknown data.
 */
export function parseSpeedWithUnit(value: unknown): number | null {
  const match = /^([-+]?\d+(?:[.,]\d+)?)\s*([A-Za-z/]+)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const factor = UNIT_FACTORS[match[2].toLowerCase()];
  if (factor === undefined) return null;
  const amount = numeric(match[1]);
  return amount === null ? null : amount * factor;
}

export function parseBelchertown(json: BelchertownData): Omit<WindSample, "sourceId" | "sourceKind" | "stationId"> {
  const current = json.current ?? {};
  const speedMs = parseSpeedWithUnit(current.windspeed);
  const directionDeg = numeric(current.winddir_formatted);
  const gustMs = parseSpeedWithUnit(current.windGust);
  const stamp = numeric(current.datetime_raw);

  if (!validWind(speedMs, directionDeg)) throw new Error("Club station has no usable wind reading");
  // The archive time, not the moment we asked. A club station that has
  // stopped updating keeps serving its last record forever, and only this
  // timestamp reveals that.
  if (stamp === null || stamp <= 0) throw new Error("Club station reading has no measurement time");

  return {
    timestamp: new Date(stamp * 1000).toISOString(),
    windSpeedMs: speedMs!,
    windDirectionDeg: directionDeg! % 360,
    windGustMs: validGust(gustMs),
    quality: "good",
    staleAfterMinutes: 20,
    note: "Club-operated WeeWX station. Measurement time is its own archive time; siting and calibration have not been independently checked.",
  };
}

export const weewxProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    // No directory to fall back on: without the feed URL there is nothing
    // to fetch, and guessing one from the station id would be inventing
    // an address.
    if (!source.url) return [];
    const json = (await fetchSource(source.url)) as BelchertownData;
    const parsed = parseBelchertown(json);
    return [
      {
        sourceId: "weewx",
        sourceKind: "observation",
        stationId: source.station_id ?? undefined,
        ...parsed,
      },
    ];
  },
};
