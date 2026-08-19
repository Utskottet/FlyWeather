import { useEffect, useState } from "react";
import { buildWindGrid } from "../domain/windGrid.ts";
import { fetchWindGrid, type GridWindPoint } from "../providers/forecast/openMeteoGridProvider.ts";
import type { LatLonBounds } from "../components/Map/mapBounds.ts";

const GRID_RESOLUTION = 6; // 6x6 = up to 36 points

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
