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
  wind_gusts_10m: (number | null)[];
  weather_code: (number | null)[];
}

export interface OpenMeteoResponse {
  hourly: OpenMeteoHourly;
}

export function buildOpenMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
    wind_speed_unit: "ms",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

/** Normalizes a raw Open-Meteo response into our internal SiteForecast shape. Pure - no network. */
export function normalizeOpenMeteoResponse(siteId: string, raw: OpenMeteoResponse): SiteForecast {
  const { hourly } = raw;
  return {
    siteId,
    sourceId: "open-meteo",
    hours: hourly.time,
    windDirectionDeg: hourly.wind_direction_10m,
    windSpeedMs: hourly.wind_speed_10m,
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
