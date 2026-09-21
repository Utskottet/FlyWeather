import type { GridPoint } from "../../domain/windGrid.ts";
import { MODEL_HEIGHTS_M, type SiteForecast, type WindGridPoint } from "../../domain/types.ts";
import { POINT_FORECAST_HEIGHTS_M } from "../../domain/forecastSource.ts";
import { forecastHourMs } from "../../domain/forecastTime.ts";

/**
 * Consumes FlyWeather-Soaring's real Wind v1 product (§ Simplify DMI Wind
 * v1) - the primary wind source, with Open-Meteo (openMeteoGridProvider.ts/
 * openMeteoProvider.ts) as the fallback when this is unavailable. Reads
 * `manifest.json`'s `wind` section and the per-hour numeric files it
 * points to as an opaque, versioned external contract (same "never guess a
 * filename/shape" discipline useSoaringManifest.ts already established for
 * the RASP parameters) - this app never knows DMI parameter identity or
 * the Lambert-rotation math that produced these u/v values, only the
 * published shape (docs/PRODUCT_CONTRACT.md's `wind` section).
 */

interface DmiWindGridInfo {
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  cols: number;
  rows: number;
}

interface DmiWindManifestEntry {
  unit: string;
  heightsM: number[];
  grid: DmiWindGridInfo;
  validTimes: string[];
  files: { validTime: string; numeric: string }[];
}

interface DmiWindNumericFile {
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  orientation: string; // "row0=north,col0=west" - see products/render.py's documented contract
  unit: string;
  heightsM: number[];
  coverageFrac: Record<string, number>;
  u: Record<string, (number | null)[][]>;
  v: Record<string, (number | null)[][]>;
}

export interface DmiWindBatch {
  /** ISO-8601 UTC valid times, one per fetched hour - DMI's own hours, not yet reconciled to any other source's timestamp array. */
  hours: string[];
  points: WindGridPoint[];
}

/**
 * Bilinear sample of one height's u or v raster at an arbitrary lat/lon.
 * row0=north/col0=west (products/render.py's documented orientation, not
 * assumed) - so latitude decreases as row increases, the opposite sense
 * from a typical y-up sampling. Returns null outside the grid's bbox, or
 * if all 4 surrounding cells are null (no real data there) - never
 * fabricates a value, matching windField.ts's sampleWindField contract.
 */
function sampleRasterAt(
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
  values: (number | null)[][],
  lat: number,
  lon: number,
): number | null {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) return null;

  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  const fx = ((lon - minLon) / lonSpan) * (cols - 1);
  const fy = ((maxLat - lat) / latSpan) * (rows - 1); // row0=north

  const col0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const col1 = Math.min(cols - 1, col0 + 1);
  const row0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
  const row1 = Math.min(rows - 1, row0 + 1);
  const tx = fx - col0;
  const ty = fy - row0;

  const corners: [number, number, number][] = [
    [row0, col0, (1 - ty) * (1 - tx)],
    [row0, col1, (1 - ty) * tx],
    [row1, col0, ty * (1 - tx)],
    [row1, col1, ty * tx],
  ];

  let sum = 0;
  let weightSum = 0;
  for (const [r, c, w] of corners) {
    const val = values[r]?.[c];
    if (val === null || val === undefined) continue;
    sum += val * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return sum / weightSum;
}

/**
 * u/v (real east/north components - already rotated to true north on the
 * backend, docs/DMI_DATA_AUDIT.md #10a) -> meteorological speed/direction,
 * same convention every other value in this app uses (direction wind
 * comes FROM, §29.3).
 */
function uvToSpeedDir(u: number | null, v: number | null): { windSpeedMs: number | null; windDirectionDeg: number | null } {
  if (u === null || v === null) return { windSpeedMs: null, windDirectionDeg: null };
  const windSpeedMs = Math.hypot(u, v);
  const windDirectionDeg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { windSpeedMs, windDirectionDeg };
}

/**
 * The published manifest's real heights must match this build's own
 * MODEL_HEIGHTS_M exactly - two independently-defined constants (separate
 * repos/languages, see types.ts's MODEL_HEIGHTS_M docstring), never
 * silently reinterpreted if they've drifted. Throws rather than guessing a
 * mapping - a caller can catch this and fall back to Open-Meteo, the same
 * "never serve data the frontend can't correctly read" discipline
 * scripts/collect-forecasts.ts already applies to the wind-grid file shape.
 */
export function assertDmiHeightsMatch(manifestHeights: number[]): void {
  const expected = [...MODEL_HEIGHTS_M].sort((a, b) => a - b);
  const actual = [...manifestHeights].sort((a, b) => a - b);
  const matches = expected.length === actual.length && expected.every((h, i) => h === actual[i]);
  if (!matches) {
    throw new Error(
      `DMI wind manifest heights [${actual.join(",")}] don't match this build's MODEL_HEIGHTS_M [${expected.join(",")}] - refusing to guess a mapping`,
    );
  }
}

/** Fetches manifest.json and returns its `wind` section, or throws if the product isn't published. */
export async function fetchDmiWindManifestEntry(soaringBaseUrl: string): Promise<DmiWindManifestEntry> {
  const res = await fetch(`${soaringBaseUrl}/manifest.json`);
  if (!res.ok) throw new Error(`DMI manifest request failed (HTTP ${res.status})`);
  const manifest = (await res.json()) as { wind?: DmiWindManifestEntry };
  if (!manifest.wind) throw new Error("DMI manifest has no wind product");
  assertDmiHeightsMatch(manifest.wind.heightsM);
  return manifest.wind;
}

/**
 * Samples DMI's real wind product at an arbitrary set of points - used for
 * BOTH the animated regional field (points = a coarse map-bounds grid,
 * domain/windGrid.ts's buildWindGrid) and per-site forecasts (points = the
 * site catalogue's own coordinates), since both are just "give me wind at
 * this lat/lon, at every DMI height, for every published hour" - the same
 * raster sampling either way, per this project's "one interpolation path,
 * not two that could silently diverge" precedent (windField.ts's own
 * windGridPointAtHeight docstring).
 *
 * Fetches every published hour's numeric file in parallel - these are
 * small pre-generated static files on FlyWeather-Soaring's own GitHub
 * Pages host (not DMI's live, rate-limited API), so unlike the backend's
 * own DMI fetches this has no meaningful rate-limit exposure.
 */
export async function fetchDmiWindGrid(soaringBaseUrl: string, points: GridPoint[]): Promise<DmiWindBatch> {
  if (points.length === 0) return { hours: [], points: [] };

  const wind = await fetchDmiWindManifestEntry(soaringBaseUrl);

  const perHourFiles = await Promise.all(
    wind.files.map(async (f) => {
      const res = await fetch(`${soaringBaseUrl}/${f.numeric}`);
      if (!res.ok) throw new Error(`DMI wind file request failed (HTTP ${res.status}): ${f.numeric}`);
      return { validTime: f.validTime, data: (await res.json()) as DmiWindNumericFile };
    }),
  );

  const hours = perHourFiles.map((f) => f.validTime);
  const gridPoints: WindGridPoint[] = points.map((point) => {
    const heights = Object.fromEntries(
      MODEL_HEIGHTS_M.map((h) => {
        const windDirectionDeg: (number | null)[] = [];
        const windSpeedMs: (number | null)[] = [];
        for (const { data } of perHourFiles) {
          const uGrid = data.u[String(h)];
          const vGrid = data.v[String(h)];
          const u = uGrid ? sampleRasterAt(data.bbox, data.cols, data.rows, uGrid, point.lat, point.lon) : null;
          const v = vGrid ? sampleRasterAt(data.bbox, data.cols, data.rows, vGrid, point.lat, point.lon) : null;
          const sample = uvToSpeedDir(u, v);
          windDirectionDeg.push(sample.windDirectionDeg);
          windSpeedMs.push(sample.windSpeedMs);
        }
        return [h, { windDirectionDeg, windSpeedMs }];
      }),
    ) as WindGridPoint["heights"];
    return { lat: point.lat, lon: point.lon, heights };
  });

  return { hours, points: gridPoints };
}

// Same tolerance precedent RASP_TIME_TOLERANCE_MINUTES already established
// (domain/soaring.ts) for matching across independently-timed data
// sources - both DMI and Open-Meteo publish hourly-aligned timestamps, so
// this absorbs minor generation-timing slop without ever silently
// substituting a genuinely different hour.
const WIND_TIME_TOLERANCE_MINUTES = 30;

function nearestDmiHourIndex(dmiHours: string[], targetIso: string): number | null {
  const targetMs = forecastHourMs(targetIso);
  if (!Number.isFinite(targetMs)) return null;
  const toleranceMs = WIND_TIME_TOLERANCE_MINUTES * 60 * 1000;
  let bestIndex: number | null = null;
  let bestDiff = Infinity;
  for (let i = 0; i < dmiHours.length; i++) {
    const ms = forecastHourMs(dmiHours[i]);
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  if (bestIndex === null || bestDiff > toleranceMs) return null;
  return bestIndex;
}

/**
 * Fills a site forecast's upper-air heights from the regional wind raster,
 * leaving the point forecast's own surface wind alone.
 *
 * This function used to replace `.heights` wholesale - every height, 10 m
 * included - which quietly substituted a coarse regional sample for the
 * site-specific forecast that had just been fetched, while `sourceId`,
 * the gust and the weather symbol all stayed behind from Open-Meteo. The
 * result was one object whose fields disagreed about where they came
 * from, and a surface wind that was systematically too low on exactly the
 * coastal sites this app exists to serve. The full measurement is in
 * docs/FORECAST_INTEGRITY.md.
 *
 * Now the split is explicit: POINT_FORECAST_HEIGHTS_M stay exactly as the
 * point forecast produced them, and only the heights the point forecast
 * cannot answer are taken from the raster. Hours the raster does not
 * reach are left null at those upper heights - an honest reflection of a
 * shorter horizon, never backfilled from another source. At the surface
 * there is nothing to leave null, because the point forecast covers its
 * own full horizon; that alone restored the 50% of hours this function
 * used to blank out.
 *
 * `hours`, `weatherKind` and `windGustMs` are untouched, as before.
 */
export function mergeDmiWindIntoSiteForecast(forecast: SiteForecast, dmiPoint: WindGridPoint, dmiHours: string[]): SiteForecast {
  // One lookup per hour rather than one per hour per height per field -
  // the answer cannot differ between heights, and computing it once makes
  // it impossible for them to disagree.
  const indexForHour = forecast.hours.map((hourIso) => nearestDmiHourIndex(dmiHours, hourIso));

  const heights = Object.fromEntries(
    MODEL_HEIGHTS_M.map((h) => {
      if (POINT_FORECAST_HEIGHTS_M.includes(h)) return [h, forecast.heights[h]];
      return [
        h,
        {
          windDirectionDeg: indexForHour.map((idx) => (idx === null ? null : dmiPoint.heights[h].windDirectionDeg[idx])),
          windSpeedMs: indexForHour.map((idx) => (idx === null ? null : dmiPoint.heights[h].windSpeedMs[idx])),
        },
      ];
    }),
  ) as SiteForecast["heights"];

  return { ...forecast, heights };
}
