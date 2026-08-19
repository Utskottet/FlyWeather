import { useEffect, useState } from "react";
import { buildWindGrid } from "../domain/windGrid.ts";
import { fetchWindGrid, type GridWindPoint } from "../providers/forecast/openMeteoGridProvider.ts";
import type { LatLonBounds } from "../components/Map/mapBounds.ts";

// 15x15 = up to 225 points, ~6.25x the previous 6x6=36 grid - user
// feedback after Block 10 asked for "x6 density." Verified the request
// URL (comma-separated lat/lon lists) stays well under 4000 chars at
// this size, far below typical URL length limits.
const GRID_RESOLUTION = 15;

interface WindGridState {
  points: GridWindPoint[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a regional current-wind field once per bounds change (§9's
 * "regional wind indication"). Deliberately shows only NOW conditions,
 * independent of the site roses' time slider - tying this to the
 * slider would multiply the request volume by ~73x for no proven need
 * yet; noted as a possible future enhancement in docs/DECISIONS.md.
 */
export function useWindGrid(bounds: LatLonBounds | null): WindGridState {
  const [state, setState] = useState<WindGridState>({ points: [], loading: true, error: null });
  const boundsKey = bounds ? `${bounds.minLat},${bounds.maxLat},${bounds.minLon},${bounds.maxLon}` : null;

  useEffect(() => {
    if (!bounds) {
      setState({ points: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    const grid = buildWindGrid(bounds, GRID_RESOLUTION);

    fetchWindGrid(grid)
      .then((points) => {
        if (!cancelled) setState({ points, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ points: [], loading: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  return state;
}
