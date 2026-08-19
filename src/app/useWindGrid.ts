import { useEffect, useState } from "react";
import { findNowIndex } from "../domain/timeAxis.ts";
import type { GeneratedWindGridFile, WindGridPoint } from "../domain/types.ts";

const GRID_URL = `${import.meta.env.BASE_URL}generated/forecast-wind-grid.json`;
const SLIDER_STEPS = 72; // NOW + 72 hourly steps, matching useSiteForecasts.ts / MASTER_SPEC.md §6

interface WindGridState {
  /** Each point's arrays are already windowed to [NOW..+72h] - index 0 is always NOW, same as SiteForecast. */
  points: WindGridPoint[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads the regional wind field from a static file published by
 * scripts/collect-forecasts.ts on the weather-refresh cron, rather than
 * calling Open-Meteo directly per visitor - every visitor's browser
 * fetching its own grid independently is what tripped Open-Meteo's real
 * rate limit under live traffic (see docs/DECISIONS.md's "production
 * regression" entry). The file carries hourly wind per point (not just
 * current conditions) so the arrow field can follow the time slider,
 * per user feedback ("arrows not changing on time slider so no
 * forcasting") - windowing to NOW..+72h happens here against the
 * browser's own clock, same reasoning and pattern as useSiteForecasts.ts.
 */
export function useWindGrid(): WindGridState {
  const [state, setState] = useState<WindGridState>({
    points: [],
    generatedAt: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const now = new Date();

    fetch(GRID_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Wind grid file request failed (HTTP ${res.status})`);
        return res.json() as Promise<GeneratedWindGridFile>;
      })
      .then((data) => {
        if (cancelled) return;

        const nowIdx = findNowIndex(data.hours, now);
        const end = nowIdx + SLIDER_STEPS + 1;
        const points = data.points.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          windDirectionDeg: p.windDirectionDeg.slice(nowIdx, end),
          windSpeedMs: p.windSpeedMs.slice(nowIdx, end),
        }));

        setState({ points, generatedAt: data.generatedAt, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            points: [],
            generatedAt: null,
            loading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
