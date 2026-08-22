import { useEffect, useState } from "react";
import { SLIDER_STEPS, findNowIndex } from "../domain/timeAxis.ts";
import { MODEL_HEIGHTS_M } from "../domain/types.ts";
import type { LocatedSite } from "../domain/sites.ts";
import type { GeneratedForecastSitesFile, SiteForecast } from "../domain/types.ts";

const FORECAST_URL = `${import.meta.env.BASE_URL}generated/forecast-sites.json`;

interface SiteForecastsState {
  /** Each forecast's arrays are already windowed to [NOW..+72h] - index 0 is always NOW. */
  forecastsBySiteId: Record<string, SiteForecast>;
  hours: string[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads every located site's forecast from a static file published by
 * scripts/collect-forecasts.ts on the weather-refresh cron, rather than
 * every visitor's browser calling Open-Meteo directly - that per-
 * visitor pattern (even batched into one request per site) tripped
 * Open-Meteo's real rate limit under live traffic once the wind grid
 * grew denser (see docs/DECISIONS.md's "production regression" entry).
 * The file carries the full un-windowed forecast (Open-Meteo's raw
 * multi-day hourly data); windowing to NOW..+72h still happens here,
 * against the browser's own clock, so "NOW" stays accurate to the
 * visitor's actual view time rather than locked to whenever the
 * collector last ran - the collector's cadence (every 5 min) only
 * affects how fresh the underlying hourly values are, not which hour
 * index counts as "now."
 */
export function useSiteForecasts(sites: LocatedSite[]): SiteForecastsState {
  const [state, setState] = useState<SiteForecastsState>({
    forecastsBySiteId: {},
    hours: [],
    generatedAt: null,
    loading: true,
    error: null,
  });

  const siteKey = sites.map((s) => s.id).join(",");

  useEffect(() => {
    if (sites.length === 0) {
      setState({ forecastsBySiteId: {}, hours: [], generatedAt: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    const now = new Date();

    fetch(FORECAST_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Forecast file request failed (HTTP ${res.status})`);
        return res.json() as Promise<GeneratedForecastSitesFile>;
      })
      .then((data) => {
        if (cancelled) return;

        const forecastsBySiteId: Record<string, SiteForecast> = {};
        let windowHours: string[] = [];

        for (const site of sites) {
          const f = data.sites[site.id];
          if (!f) continue;

          const nowIdx = findNowIndex(f.hours, now);
          const end = nowIdx + SLIDER_STEPS + 1;
          const heights = {} as SiteForecast["heights"];
          for (const h of MODEL_HEIGHTS_M) {
            heights[h] = {
              windDirectionDeg: f.heights[h].windDirectionDeg.slice(nowIdx, end),
              windSpeedMs: f.heights[h].windSpeedMs.slice(nowIdx, end),
            };
          }
          const windowed: SiteForecast = {
            ...f,
            hours: f.hours.slice(nowIdx, end),
            heights,
            windGustMs: f.windGustMs.slice(nowIdx, end),
            weatherKind: f.weatherKind.slice(nowIdx, end),
          };
          forecastsBySiteId[f.siteId] = windowed;
          if (windowed.hours.length > windowHours.length) windowHours = windowed.hours;
        }

        setState({ forecastsBySiteId, hours: windowHours, generatedAt: data.generatedAt, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      });

    return () => {
      cancelled = true;
    };
    // re-fetch only when the located-site set actually changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return state;
}
