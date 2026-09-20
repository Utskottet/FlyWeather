import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";
import { fetchSource } from "./sourceUrl.ts";
import { numeric, stockholmTimestamp, validGust, validWind } from "./parse.ts";

/**
 * Uses Sjöfartsverket's (Swedish Maritime Administration) public ViVa
 * (Vind och Vattenstånd) JSON API, the same one https://viva.sjofartsverket.se
 * itself calls client-side - confirmed by loading a real station page in a
 * browser and inspecting the network requests: the app first fetches
 * `/assets/config/config.json` for its `baseUrl`, then calls
 * `{baseUrl}ViVaStationWithDirection/{stationId}?isMVY=false`. No API key
 * or password required, unauthenticated GET, same mechanism as the site's
 * own frontend - not a private/internal endpoint.
 */
const VIVA_BASE_URL = "https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/";

export function buildVivaUrl(stationId: string): string {
  return `${VIVA_BASE_URL}ViVaStationWithDirection/${stationId}?isMVY=false`;
}

interface VivaSample {
  Name: string;
  Value: string;
  Heading: number;
  Unit: string;
  Type: string;
  Quality: string;
  /** Swedish wall-clock time, no offset - see parse.ts's stockholmTimestamp. */
  Updated?: string;
}

interface VivaResponse {
  GetSingleStationWithDirectionsAsParametersResult?: {
    ID: number;
    Name: string;
    Samples: VivaSample[];
  };
}

export interface ParsedVivaStation {
  windDirectionDeg: number;
  windSpeedMs: number;
  /** Null when this station does not report gusts, or reports one it flags as bad. */
  windGustMs: number | null;
  /** ViVa's own measurement time, or null when it cannot be resolved unambiguously. */
  observedAt: string | null;
}

/**
 * ViVa reports three separate named samples rather than one combined
 * reading (confirmed against the real station 25/Barsebäck response):
 * - "Medelvind" (mean wind) -> sustained speed
 * - "Byvind" (gust wind) -> gust speed
 * - "Vindriktning" (wind direction) -> direction in degrees
 * Speed/gust `Value` strings are prefixed with a Swedish compass
 * abbreviation ("V 3.2" = West, 3.2 m/s) - the number is what we want,
 * the letter is redundant with (and less precise than) Vindriktning's own
 * decimal-degree value, so it's stripped rather than parsed as a
 * direction. Each sample also carries its own `Quality` field ("Ok" seen
 * on a healthy station) - a non-"Ok" quality on the samples we actually
 * use is treated as "no usable reading" rather than serving a flagged
 * value silently.
 */
export function parseVivaResponse(json: unknown): ParsedVivaStation | null {
  if (!json || typeof json !== "object") return null;
  const result = (json as VivaResponse).GetSingleStationWithDirectionsAsParametersResult;
  if (!result || !Array.isArray(result.Samples)) return null;

  const bySample = (name: string) => result.Samples.find((s) => s.Name === name);
  const mean = bySample("Medelvind");
  const gust = bySample("Byvind");
  const direction = bySample("Vindriktning");

  // Gust is NOT required. This used to demand all three samples and all
  // three qualities, so a ViVa station that simply does not report gusts
  // produced no live wind at all - a missing gust silently cost the whole
  // reading, which is exactly backwards: missing gust means unknown gust,
  // not unknown wind.
  if (!mean || !direction) return null;
  if (mean.Quality !== "Ok" || direction.Quality !== "Ok") return null;
  if (mean.Unit !== "m/s") return null;

  const trailingNumber = (value: string | undefined) => numeric(value?.match(/([-+]?\d+(?:[.,]\d+)?)\s*$/)?.[1]);
  const windSpeedMs = trailingNumber(mean.Value);
  const windDirectionDeg = numeric(direction.Value);
  if (!validWind(windSpeedMs, windDirectionDeg)) return null;

  // Only when the gust was measured at the same instant as the mean -
  // ViVa timestamps each sample separately, and pairing a gust from a
  // different minute with this wind would describe a moment that never
  // happened.
  const gustMs =
    gust && gust.Quality === "Ok" && gust.Unit === "m/s" && gust.Updated === mean.Updated
      ? validGust(trailingNumber(gust.Value))
      : null;

  // Both must resolve, and to the same instant. A speed from 14:35 and a
  // direction from 14:30 is not one observation.
  const meanAt = stockholmTimestamp(mean.Updated);
  const directionAt = stockholmTimestamp(direction.Updated);
  const observedAt = meanAt !== null && meanAt === directionAt ? meanAt : null;

  return { windDirectionDeg: windDirectionDeg! % 360, windSpeedMs: windSpeedMs!, windGustMs: gustMs, observedAt };
}

async function fetchVivaJson(stationId: string): Promise<unknown | null> {
  try {
    return await fetchSource(buildVivaUrl(stationId));
  } catch {
    return null;
  }
}

export const vivaProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    if (!source.station_id) return [];
    const json = await fetchVivaJson(source.station_id);
    if (!json) return [];
    const parsed = parseVivaResponse(json);
    if (!parsed) return [];

    // ViVa's "Updated" IS a full date and time - it is simply Swedish
    // wall-clock with no offset, which parse.ts resolves (and refuses to
    // guess at, for the one repeated hour each autumn). This used to
    // stamp the fetch time instead and call it honest; it is strictly
    // better to publish the time the wind was actually measured, and to
    // say "age unknown" on the rare occasion it cannot be pinned down.
    return [
      {
        sourceId: "viva",
        sourceKind: "observation",
        stationId: source.station_id,
        timestamp: parsed.observedAt ?? new Date().toISOString(),
        ageConfirmed: parsed.observedAt !== null,
        windDirectionDeg: parsed.windDirectionDeg,
        windSpeedMs: parsed.windSpeedMs,
        windGustMs: parsed.windGustMs,
        quality: "good",
        staleAfterMinutes: 20,
        note:
          parsed.observedAt !== null
            ? undefined
            : "ViVa reported a local time that falls in the repeated hour when clocks go back, so its age cannot be confirmed.",
      },
    ];
  },
};
