import type { WeatherKind } from "./weather.ts";

/** A single normalized wind observation or forecast point (MASTER_SPEC.md §10). */
export interface WindSample {
  sourceId: string;
  sourceKind: "observation" | "forecast";
  stationId?: string;
  /** Station coordinates, when the source actually provides them - not every widget/API does. */
  lat?: number;
  lon?: number;
  timestamp: string; // ISO-8601 UTC
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  temperatureC?: number | null;
  quality?: "good" | "suspect" | "stale";
}

export interface HeightWindSeries {
  windDirectionDeg: (number | null)[];
  windSpeedMs: (number | null)[];
}

/** Model heights (m AGL) this app requests wind for - Open-Meteo's discrete offering (§7.2). */
export const MODEL_HEIGHTS_M = [10, 80, 120, 180] as const;
export type ModelHeightM = (typeof MODEL_HEIGHTS_M)[number];

/**
 * Hourly forecast for one site, aligned to a shared `hours` timestamp
 * array so the time slider can index every site's data by the same
 * position without a per-tick fetch (§26). `heights` carries wind at
 * each discrete model height for Surface/Soaring height mode (§7);
 * gust is only meaningfully available at surface.
 */
export interface SiteForecast {
  siteId: string;
  sourceId: string;
  hours: string[]; // ISO-8601 UTC, one entry per hourly step
  heights: Record<ModelHeightM, HeightWindSeries>;
  windGustMs: (number | null)[]; // surface (10m) gust
  weatherKind: WeatherKind[];
}

export interface ForecastSiteRequest {
  siteId: string;
  lat: number;
  lon: number;
}

export interface ForecastProvider {
  fetchSiteForecast(site: ForecastSiteRequest): Promise<SiteForecast>;
}

/** Shape of public/generated/live.json as written by scripts/collect-live.ts. */
export interface GeneratedLiveFile {
  generatedAt: string;
  liveCollector: {
    status: "ok" | "partial" | "failed";
    sourcesOk: number;
    sourcesFailed: number;
  };
  sites: Record<string, { status: "ok" | "unavailable" | "failed"; sample: WindSample | null }>;
}
