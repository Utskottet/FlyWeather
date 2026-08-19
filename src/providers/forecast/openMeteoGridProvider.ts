import type { GridPoint } from "../../domain/windGrid.ts";
import type { WindGridPoint } from "../../domain/types.ts";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";

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
export function normalizeGridResponse(points: GridPoint[], raw: OpenMeteoCurrentEntry[]): WindGridPoint[] {
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
// boundary. Kept comfortably above useWindGrid's actual grid size (see
// its own comment) so a normal page load makes exactly one grid
// request, not several - after the 676-point/3-request version turned
// out to trip Open-Meteo's real-world rate limit for live users (not
// just this URL-length ceiling), reducing request COUNT mattered more
// than maximizing points per load. This batching code is kept (rather
// than removed) as a safety net for if the grid ever needs to grow
// past a single request again.
const MAX_POINTS_PER_REQUEST = 350;

async function fetchGridBatch(points: GridPoint[]): Promise<WindGridPoint[]> {
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

/**
 * Splits a large point set into multiple parallel requests, each under
 * MAX_POINTS_PER_REQUEST, rather than one URL that risks a 414 - needed
 * once the grid grew past ~500 points (see MAX_POINTS_PER_REQUEST's
 * comment). Order is preserved (batches are sliced contiguously and
 * concatenated in the same order), which matters since
 * normalizeGridResponse matches results back to points by index.
 */
export async function fetchWindGrid(points: GridPoint[]): Promise<WindGridPoint[]> {
  if (points.length === 0) return [];
  const batches: GridPoint[][] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    batches.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  }
  const results = await Promise.all(batches.map(fetchGridBatch));
  return results.flat();
}
