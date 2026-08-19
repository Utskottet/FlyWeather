import { openMeteoCodeToWeatherKind } from "../../domain/weather.ts";
import type { ForecastProvider, ForecastSiteRequest, SiteForecast } from "../../domain/types.ts";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
// 5 days of hourly data guarantees the full NOW..+72h window is covered
// regardless of what hour "now" happens to be within day 0 (§6).
const FORECAST_DAYS = 5;

export interface OpenMeteoHourly {
  time: string[];
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  wind_speed_80m: (number | null)[];
  wind_direction_80m: (number | null)[];
  wind_speed_120m: (number | null)[];
  wind_direction_120m: (number | null)[];
  wind_speed_180m: (number | null)[];
  wind_direction_180m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  weather_code: (number | null)[];
}

export interface OpenMeteoResponse {
  hourly: OpenMeteoHourly;
}

const HOURLY_VARS = [
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_speed_80m",
  "wind_direction_80m",
  "wind_speed_120m",
  "wind_direction_120m",
  "wind_speed_180m",
  "wind_direction_180m",
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
  const heights: SiteForecast["heights"] = {
    10: { windDirectionDeg: hourly.wind_direction_10m, windSpeedMs: hourly.wind_speed_10m },
    80: { windDirectionDeg: hourly.wind_direction_80m, windSpeedMs: hourly.wind_speed_80m },
    120: { windDirectionDeg: hourly.wind_direction_120m, windSpeedMs: hourly.wind_speed_120m },
    180: { windDirectionDeg: hourly.wind_direction_180m, windSpeedMs: hourly.wind_speed_180m },
  };
  return {
    siteId,
    sourceId: "open-meteo",
    hours: hourly.time,
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
