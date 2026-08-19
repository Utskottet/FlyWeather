import type { GridPoint } from "../../domain/windGrid.ts";
import type { WindGridPoint } from "../../domain/types.ts";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
// Same window as site forecasts (openMeteoProvider.ts) - guarantees the
// full NOW..+72h slider range is covered regardless of what hour "now"
// happens to be within day 0 (§6), and keeps both datasets on the same
// forecast horizon.
const FORECAST_DAYS = 5;

interface OpenMeteoHourlyGridEntry {
  latitude: number;
  longitude: number;
  hourly?: {
    time: string[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
  };
}

/**
 * Open-Meteo accepts comma-separated lat/lon lists in one request
 * (verified live) - `hourly` (not `current`) so the wind-arrow field
 * can follow the time slider instead of only ever showing current
 * conditions (per user feedback: "arrows not changing on time slider
 * so no forcasting").
 */
export function buildGridUrl(points: GridPoint[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    hourly: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "ms",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

export interface WindGridBatch {
  hours: string[];
  points: WindGridPoint[];
}

/**
 * Normalizes Open-Meteo's multi-location response back onto the
 * originally-requested points (by index - the response preserves
 * request order). Pure - no network. `hours` is read from the first
 * entry with data - every point in the same request shares identical
 * timestamps (same forecast_days/timezone params), so there's nothing
 * to reconcile between points.
 */
export function normalizeGridResponse(points: GridPoint[], raw: OpenMeteoHourlyGridEntry[]): WindGridBatch {
  const hours = raw.find((e) => e.hourly)?.hourly?.time ?? [];
  const gridPoints = points.map((point, i) => {
    const hourly = raw[i]?.hourly;
    return {
      lat: point.lat,
      lon: point.lon,
      windDirectionDeg: hourly?.wind_direction_10m ?? hours.map(() => null),
      windSpeedMs: hourly?.wind_speed_10m ?? hours.map(() => null),
    };
  });
  return { hours, points: gridPoints };
}

// Open-Meteo's own docs say up to 1000 comma-separated locations per
// request, but that's not the real ceiling in practice: their nginx
// front-end rejects long URLs outright with a 414 before the app-level
// 1000-location check is ever reached. Empirically probed against the
// live API using this file's own buildGridUrl (URLSearchParams
// percent-encodes each comma as %2C, tripling its byte cost versus a
// naive string-concatenated URL - an easy trap that made an earlier,
// simpler probe look far safer than reality): 400 points (~8.0KB URL)
// still gets a normal response, 450 points (~9.0KB) gets a hard
// "414 Request-URI Too Large" - consistent with nginx's common 8KB
// default header/request-line limit. 350 leaves real margin below that
// boundary. This ceiling is about URL length (point count), not
// response size, so it's unaffected by switching from `current` to
// `hourly` - only the response payload grew, not the request.
const MAX_POINTS_PER_REQUEST = 350;

async function fetchGridBatch(points: GridPoint[]): Promise<WindGridBatch> {
  const res = await fetch(buildGridUrl(points));
  if (!res.ok) {
    throw new Error(`Open-Meteo grid request failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as OpenMeteoHourlyGridEntry[] | OpenMeteoHourlyGridEntry;
  // Open-Meteo returns a single object (not an array) for a one-point
  // request; buildWindGrid always produces >=4 points in practice, but
  // guard the shape anyway since it costs nothing.
  const raw = Array.isArray(json) ? json : [json];
  return normalizeGridResponse(points, raw);
}

/**
 * Splits a large point set into multiple parallel requests, each under
 * MAX_POINTS_PER_REQUEST, rather than one URL that risks a 414 - this
 * now runs server-side (scripts/collect-forecasts.ts, on the
 * weather-refresh cron) rather than per-visitor, so multiple batches
 * per run is a non-issue (a handful of extra requests every 5 minutes
 * from one caller, not multiplied by every visitor's browser - see
 * docs/DECISIONS.md's "production regression" entry for why that
 * distinction matters). Order is preserved (batches are sliced
 * contiguously and concatenated in the same order), which matters
 * since normalizeGridResponse matches results back to points by index.
 */
export async function fetchWindGrid(points: GridPoint[]): Promise<WindGridBatch> {
  if (points.length === 0) return { hours: [], points: [] };
  const batches: GridPoint[][] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    batches.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  }
  const results = await Promise.all(batches.map(fetchGridBatch));
  return {
    hours: results[0]?.hours ?? [],
    points: results.flatMap((r) => r.points),
  };
}
