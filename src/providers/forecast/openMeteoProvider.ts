import { openMeteoCodeToWeatherKind } from "../../domain/weather.ts";
import { MODEL_HEIGHTS_M, type ModelHeightM } from "../../domain/types.ts";
import { normaliseForecastHour } from "../../domain/forecastTime.ts";
import type { ForecastProvider, ForecastSiteRequest, SiteForecast } from "../../domain/types.ts";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
// 5 days of hourly data guarantees the full NOW..+72h window is covered
// regardless of what hour "now" happens to be within day 0 (§6).
const FORECAST_DAYS = 5;

// Requests wind at every one of this build's MODEL_HEIGHTS_M (DMI's real
// heights, § Simplify DMI Wind v1) the same way openMeteoGridProvider.ts
// already does - Open-Meteo (the fallback provider) only has real data at
// 10m/100m from that list (checked live, see types.ts's MODEL_HEIGHTS_M
// docstring), the rest come back null-filled, not an error.
export type OpenMeteoHourly = { time: string[]; wind_gusts_10m: (number | null)[]; weather_code: (number | null)[] } & Partial<
  Record<`wind_speed_${ModelHeightM}m` | `wind_direction_${ModelHeightM}m`, (number | null)[]>
>;

export interface OpenMeteoResponse {
  hourly: OpenMeteoHourly;
}

const HOURLY_VARS = [
  ...MODEL_HEIGHTS_M.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
  "wind_gusts_10m",
  "weather_code",
];

export function buildOpenMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY_VARS.join(","),
    wind_speed_unit: "ms",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

/**
 * One request for every site's forecast, using the same comma-separated
 * multi-location capability the wind grid (Block 10) already relies on -
 * verified live that it also works with full hourly variables, not just
 * `current`. With 24 sites now located (Block 13), fetching each one
 * individually was 24 separate requests per page load; this cuts it to 1.
 */
export function buildOpenMeteoBatchUrl(points: { lat: number; lon: number }[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(6)).join(","),
    longitude: points.map((p) => p.lon.toFixed(6)).join(","),
    hourly: HOURLY_VARS.join(","),
    wind_speed_unit: "ms",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

/** Normalizes a raw Open-Meteo response into our internal SiteForecast shape. Pure - no network. */
export function normalizeOpenMeteoResponse(siteId: string, raw: OpenMeteoResponse): SiteForecast {
  const { hourly } = raw;
  const nulls = () => hourly.time.map(() => null);
  const heights = Object.fromEntries(
    MODEL_HEIGHTS_M.map((h) => [
      h,
      {
        windDirectionDeg: hourly[`wind_direction_${h}m`] ?? nulls(),
        windSpeedMs: hourly[`wind_speed_${h}m`] ?? nulls(),
      },
    ]),
  ) as SiteForecast["heights"];
  return {
    siteId,
    sourceId: "open-meteo",
    // Stamped with their zone on the way in. Open-Meteo is asked for
    // timezone=UTC and answers "2026-09-22T17:00" with nothing saying so,
    // which every naive new Date() in the app then read as local time -
    // see domain/forecastTime.ts. Normalising here means data generated
    // from now on says what it means, and nothing downstream has to infer.
    hours: hourly.time.map(normaliseForecastHour),
    heights,
    windGustMs: hourly.wind_gusts_10m,
    weatherKind: hourly.weather_code.map(openMeteoCodeToWeatherKind),
  };
}

export const openMeteoForecastProvider: ForecastProvider = {
  async fetchSiteForecast(site: ForecastSiteRequest): Promise<SiteForecast> {
    const url = buildOpenMeteoUrl(site.lat, site.lon);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo request failed for ${site.siteId} (HTTP ${res.status})`);
    }
    const raw = (await res.json()) as OpenMeteoResponse;
    return normalizeOpenMeteoResponse(site.siteId, raw);
  },
};

/** Fetches every site's forecast in a single batched request. */
export async function fetchSitesForecastBatch(sites: ForecastSiteRequest[]): Promise<SiteForecast[]> {
  if (sites.length === 0) return [];
  if (sites.length === 1) return [await openMeteoForecastProvider.fetchSiteForecast(sites[0])];

  const url = buildOpenMeteoBatchUrl(sites);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo batch request failed (HTTP ${res.status})`);
  }
  const raw = (await res.json()) as OpenMeteoResponse[];
  return sites.map((site, i) => normalizeOpenMeteoResponse(site.siteId, raw[i]));
}
