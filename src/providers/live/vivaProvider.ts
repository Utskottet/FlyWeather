import type { WindSample } from "../../domain/types.ts";
import type { LiveWindProvider, SiteLiveSource } from "./types.ts";

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
  windGustMs: number;
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
  if (!mean || !gust || !direction) return null;
  if (mean.Quality !== "Ok" || gust.Quality !== "Ok" || direction.Quality !== "Ok") return null;

  const speedMatch = mean.Value.match(/([\d.]+)\s*$/);
  const gustMatch = gust.Value.match(/([\d.]+)\s*$/);
  const windSpeedMs = speedMatch ? Number(speedMatch[1]) : NaN;
  const windGustMs = gustMatch ? Number(gustMatch[1]) : NaN;
  const windDirectionDeg = Number(direction.Value);

  if (!Number.isFinite(windSpeedMs) || !Number.isFinite(windGustMs) || !Number.isFinite(windDirectionDeg)) {
    return null;
  }

  return { windDirectionDeg, windSpeedMs, windGustMs };
}

async function fetchVivaJson(stationId: string): Promise<unknown | null> {
  const res = await fetch(buildVivaUrl(stationId));
  if (!res.ok) return null;
  return res.json();
}

export const vivaProvider: LiveWindProvider = {
  async fetch(source: SiteLiveSource): Promise<WindSample[]> {
    if (!source.station_id) return [];
    const json = await fetchVivaJson(source.station_id);
    if (!json) return [];
    const parsed = parseVivaResponse(json);
    if (!parsed) return [];

    // ViVa's own "Updated" field is a local Swedish time with no explicit
    // date/timezone info in the samples we use - same ambiguity as
    // Holfuy's widget "HH:MM". Using the fetch time is honest and safe:
    // the ViVa frontend itself polls every 30s (config.json's
    // widgetUpdateInterval), so the underlying reading is never stale by
    // more than that when we fetch it.
    const timestamp = new Date().toISOString();

    return [
      {
        sourceId: "viva",
        sourceKind: "observation",
        stationId: source.station_id,
        timestamp,
        windDirectionDeg: parsed.windDirectionDeg,
        windSpeedMs: parsed.windSpeedMs,
        windGustMs: parsed.windGustMs,
        quality: "good",
      },
    ];
  },
};
