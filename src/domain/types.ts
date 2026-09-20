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
  /**
   * Whether `timestamp` is when the wind was MEASURED, or merely when we
   * downloaded it.
   *
   * Absent means true - every reader that can supply a real observation
   * time does. False is for sources that publish a reading with no usable
   * date: Holfuy's public widget prints a bare "HH:MM" with no date and
   * no timezone, so the honest statement is "this is roughly current, and
   * we cannot prove how current". Freshness must not be computed from a
   * download time as though it were a measurement time, so anything that
   * reports age checks this first.
   */
  ageConfirmed?: boolean;
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
  /**
   * Missing stays missing. A station that does not report gusts is not a
   * station reporting zero gusts, and flattening the two would turn "we
   * do not know" into a reassuring number - the exact direction a wind
   * app must never round in.
   */
  windGustMs: number | null;
  /**
   * The wind is genuinely variable in direction (METAR's VRB), rather
   * than blowing from 0°. Direction is null in that case and must stay
   * null: rendering VRB as north would point a rose confidently at the
   * one direction the observer specifically declined to give.
   */
  variableDirection?: boolean;
  /**
   * A gust reported separately from the mean wind, with its own time.
   *
   * SMHI's hourly gust maximum is not simultaneous with the wind reading
   * it accompanies - it is the highest gust of some preceding period,
   * published on its own schedule. Presenting it as this instant's gust
   * would be a small, confident lie, so it travels beside the sample
   * carrying its own timestamp and its own label.
   */
  gustReport?: { windGustMs: number; timestamp: string; label: string } | null;
  temperatureC?: number | null;
  quality?: "good" | "suspect" | "stale";
  /** How long a reading from this source stays meaningful - an airport METAR is hourly, a club station is minutes. */
  staleAfterMinutes?: number;
  /** Provider-supplied caveat, shown as-is rather than summarised away. */
  note?: string;
}

export interface HeightWindSeries {
  windDirectionDeg: (number | null)[];
  windSpeedMs: (number | null)[];
}

/**
 * Model heights (m AGL) this app requests wind for - matching
 * FlyWeather-Soaring's public wind contract exactly (icon/wind.py's
 * OUTPUT_HEIGHTS_M, § UPPVIND recovery milestone: DWD ICON-EU via
 * Open-Meteo on the backend, Surface-2000m). Both sides of that contract
 * are independently defined constants, not one shared import (separate
 * repos/languages) - kept in sync by convention, and
 * providers/forecast/dmiWindProvider.ts validates the published
 * manifest's own heightsM against this list at runtime (throws rather
 * than silently guessing a mapping if they've drifted) instead of
 * trusting the two never diverge.
 *
 * Open-Meteo (the FRONTEND's own direct fallback provider, used only
 * when the backend's wind product is unavailable - a completely
 * separate code path from the backend's own ICON usage above) does NOT
 * support most of these heights - checked live, not assumed: requesting
 * wind_speed_50m/150m/250m/350m/450m returns HTTP 200 with those
 * specific fields present but entirely null (unit "undefined"), not an
 * error - only 10m/80m/100m/120m/180m come back with real data (Open-
 * Meteo's own near-surface wind fields don't extend past 180m at all;
 * heights above that were never checked live for this fallback path
 * specifically, so no claim is made about them here - don't assume).
 * This is already handled without special-casing: openMeteoGridProvider.ts/
 * openMeteoProvider.ts already default any Open-Meteo field absent-or-null
 * to a null-filled series, so the fallback naturally supplies real values
 * only where Open-Meteo actually has them and honest nulls elsewhere - a
 * disclosed degradation, not fabricated data, appropriate for a fallback.
 */
export const MODEL_HEIGHTS_M = [10, 50, 100, 150, 250, 350, 450, 600, 800, 1000, 1250, 1500, 1750, 2000] as const;
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
