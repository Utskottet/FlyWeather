import { useEffect, useState } from "react";
import { findNowIndex } from "../domain/timeAxis.ts";
import { fetchSitesForecastBatch } from "../providers/forecast/openMeteoProvider.ts";
import { MODEL_HEIGHTS_M } from "../domain/types.ts";
import type { LocatedSite } from "../domain/sites.ts";
import type { SiteForecast } from "../domain/types.ts";

const SLIDER_STEPS = 72; // NOW + 72 hourly steps, per MASTER_SPEC.md §6

interface SiteForecastsState {
  /** Each forecast's arrays are already windowed to [NOW..+72h] - index 0 is always NOW. */
  forecastsBySiteId: Record<string, SiteForecast>;
  hours: string[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches every located site's forecast in one batched request (Block
 * 13: with all 24 enabled sites now located, 24 separate requests per
 * page load was real, measurable overhead - Open-Meteo's multi-location
 * support handles this in one call, same technique as the wind grid)
 * and windows each to the NOW..+72h slider range. The time slider then
 * only ever indexes into this already-fetched data - no API call per
 * slider tick (§26).
 */
export function useSiteForecasts(sites: LocatedSite[]): SiteForecastsState {
  const [state, setState] = useState<SiteForecastsState>({
    forecastsBySiteId: {},
    hours: [],
    loading: true,
    error: null,
  });

  const siteKey = sites.map((s) => s.id).join(",");

  useEffect(() => {
    if (sites.length === 0) {
      setState({ forecastsBySiteId: {}, hours: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    const now = new Date();

    fetchSitesForecastBatch(
      sites.map((site) => ({
        siteId: site.id,
        lat: site.coordinates.lat,
        lon: site.coordinates.lon,
      })),
    )
      .then((forecasts) => {
        if (cancelled) return;

        const forecastsBySiteId: Record<string, SiteForecast> = {};
        let windowHours: string[] = [];

        for (const f of forecasts) {
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

        setState({ forecastsBySiteId, hours: windowHours, loading: false, error: null });
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
