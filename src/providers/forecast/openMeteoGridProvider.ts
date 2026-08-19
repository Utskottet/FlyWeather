import type { GridPoint } from "../../domain/windGrid.ts";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";

export interface GridWindPoint extends GridPoint {
  windDirectionDeg: number | null;
  windSpeedMs: number | null;
}

interface OpenMeteoCurrentEntry {
  latitude: number;
  longitude: number;
  current?: {
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
  };
}

/** Open-Meteo accepts comma-separated lat/lon lists in one request (verified live). */
export function buildGridUrl(points: GridPoint[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    current: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "ms",
    timezone: "UTC",
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

/**
 * Normalizes Open-Meteo's multi-location response back onto the
 * originally-requested points (by index - the response preserves
 * request order). Pure - no network.
 */
export function normalizeGridResponse(points: GridPoint[], raw: OpenMeteoCurrentEntry[]): GridWindPoint[] {
  return points.map((point, i) => {
    const entry = raw[i];
    return {
      lat: point.lat,
      lon: point.lon,
      windDirectionDeg: entry?.current?.wind_direction_10m ?? null,
      windSpeedMs: entry?.current?.wind_speed_10m ?? null,
    };
  });
}

export async function fetchWindGrid(points: GridPoint[]): Promise<GridWindPoint[]> {
  if (points.length === 0) return [];
  const res = await fetch(buildGridUrl(points));
  if (!res.ok) {
    throw new Error(`Open-Meteo grid request failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as OpenMeteoCurrentEntry[] | OpenMeteoCurrentEntry;
  // Open-Meteo returns a single object (not an array) for a one-point
  // request; buildWindGrid always produces >=4 points in practice, but
  // guard the shape anyway since it costs nothing.
  const raw = Array.isArray(json) ? json : [json];
  return normalizeGridResponse(points, raw);
}
