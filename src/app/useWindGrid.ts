import { useEffect, useState } from "react";
import { buildWindGrid } from "../domain/windGrid.ts";
import { fetchWindGrid, type GridWindPoint } from "../providers/forecast/openMeteoGridProvider.ts";
import type { LatLonBounds } from "../components/Map/mapBounds.ts";

// 18x18 = up to 324 points, ~9x the original 6x6=36 grid. User feedback
// asked to triple density again past the 225-point round (which would
// have meant 676 points, requiring 3 parallel Open-Meteo requests per
// page load instead of 1) - that version shipped, then broke live for
// real users: arrows, the time slider, and effectively "sites"
// (markers users associate with the wind field) all went blank because
// Open-Meteo started rate-limiting the app's real traffic, not just
// this session's own heavy testing. Dialed back to a resolution that
// fits comfortably in ONE request (see MAX_POINTS_PER_REQUEST in
// openMeteoGridProvider.ts) - reducing request COUNT per page load
// mattered more than maximizing points once real breakage was
// confirmed, since a daily-call-budget-style limit likely cares more
// about how many requests fire than how large any one of them is.
const GRID_RESOLUTION = 18;

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
