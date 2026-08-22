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

/**
 * Shape of public/generated/forecast-sites.json, written by
 * scripts/collect-forecasts.ts (server-side, on the weather-refresh
 * cron) rather than fetched per-visitor - the architecture fix after
 * every-visitor client-side fetching tripped Open-Meteo's real rate
 * limit under live traffic. `generatedAt` lets the frontend flag stale
 * data if the refresh cron stops running; the collector falls back to
 * re-publishing the last successfully fetched data (with its ORIGINAL
 * generatedAt, not "now") if a given refresh's Open-Meteo call fails,
 * rather than overwriting good data with nothing.
 */
export interface GeneratedForecastSitesFile {
  generatedAt: string;
  sites: Record<string, SiteForecast>;
}

/**
 * Shape of public/generated/forecast-wind-grid.json, written by
 * scripts/collect-forecasts.ts - same "last good, not blank" fallback
 * behavior as GeneratedForecastSitesFile. `hours` is shared across
 * every point (one Open-Meteo batch response, so identical timestamps
 * for all of them) and stored once here rather than duplicated per
 * point - at hundreds of grid points, repeating a ~120-entry timestamp
 * array per point would multiply file size for no reason. Each point's
 * own arrays are aligned to this shared `hours` by index, same pattern
 * as SiteForecast, so the wind-arrow field can follow the time slider
 * instead of only ever showing current conditions.
 */
export interface GeneratedWindGridFile {
  generatedAt: string;
  hours: string[]; // ISO-8601 UTC, shared across all points
  points: WindGridPoint[];
}

/**
 * `heights` mirrors SiteForecast's own per-height shape (§ FlyWeather GUI
 * Reorganization + Coherent Height Wind) - the regional animated wind
 * field used to only ever carry 10m wind, so changing HEIGHT moved the
 * site roses but not the map animation. Publishing the same
 * MODEL_HEIGHTS_M set here lets the frontend interpolate the animated
 * field to whatever altitude is selected, the same way it already does
 * for site roses (domain/heightInterpolation.ts). A schema version
 * bumped from the old flat-array shape - see collect-forecasts.ts's
 * isCompatibleGridFile, which must reject the old shape rather than
 * silently misreading it as multi-height.
 */
export interface WindGridPoint {
  lat: number;
  lon: number;
  heights: Record<ModelHeightM, HeightWindSeries>; // each series aligned to GeneratedWindGridFile.hours
}
