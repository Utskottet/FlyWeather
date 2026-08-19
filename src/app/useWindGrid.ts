import { useEffect, useState } from "react";
import type { GeneratedWindGridFile, WindGridPoint } from "../domain/types.ts";

const GRID_URL = `${import.meta.env.BASE_URL}generated/forecast-wind-grid.json`;

interface WindGridState {
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
 * regression" entry). The file already covers the full site-bounds
 * grid (resolution now lives in collect-forecasts.ts, server-side)
 * regardless of the current viewport, so this no longer takes a
 * `bounds` argument the way the old per-visitor fetch did.
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

    fetch(GRID_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Wind grid file request failed (HTTP ${res.status})`);
        return res.json() as Promise<GeneratedWindGridFile>;
      })
      .then((data) => {
        if (!cancelled) setState({ points: data.points, generatedAt: data.generatedAt, loading: false, error: null });
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
