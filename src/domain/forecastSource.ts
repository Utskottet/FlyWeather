/**
 * Which model actually produced the wind shown at a given height.
 *
 * A site forecast is no longer the output of one request. Open-Meteo's
 * point API answers at 10 m and 100 m above ground for the site's own
 * coordinates; everything higher is sampled from the regional raster
 * that also draws the animated map field. Both are real data and both
 * belong on screen - what is not acceptable is presenting them as the
 * same thing, which is exactly what this app did for months while the
 * raster silently overwrote the surface wind and the label underneath
 * still read "Open-Meteo forecast". See docs/FORECAST_INTEGRITY.md.
 *
 * So the source is a function of height, and every place that names a
 * source asks this module rather than assuming.
 */

/**
 * The heights the per-site point forecast answers at.
 *
 * Open-Meteo returns real wind at 10 m and 100 m and null-fills the rest
 * of MODEL_HEIGHTS_M. 10 m is the height a site's flyability verdict is
 * decided at, which is why nothing coarser is ever allowed to fill it.
 */
export const POINT_FORECAST_HEIGHTS_M: readonly number[] = [10, 100];

export type ForecastSourceId = "open-meteo" | "regional-grid";

/**
 * The source of the wind at `heightM`, or null when no height is shown
 * at all (the slider above real data, an hour outside the forecast).
 */
export function forecastSourceAt(heightM: number | null): ForecastSourceId | null {
  if (heightM === null) return null;
  return POINT_FORECAST_HEIGHTS_M.includes(heightM) ? "open-meteo" : "regional-grid";
}

/** The height Open-Meteo's own surface series is quoted at. */
export const SURFACE_HEIGHT_M = 10;

/**
 * What to print under a forecast reading.
 *
 * The regional grid is described as coarse rather than by a figure in
 * kilometres on purpose. A number here would be a copy of a fact that
 * lives in the grid producer's manifest, and copies go quietly wrong the
 * moment the producer changes - the same reason a site's distance to its
 * station is measured rather than written down. What the reader needs is
 * the part that does not drift: this value was not computed for this
 * site.
 */
export function forecastSourceLabel(heightM: number | null): string {
  const source = forecastSourceAt(heightM);
  if (source === null) return "Open-Meteo forecast";
  if (source === "open-meteo") {
    return heightM === SURFACE_HEIGHT_M
      ? "Open-Meteo forecast (10 m surface wind)"
      : `Open-Meteo forecast (${heightM} m AGL)`;
  }
  return `Regional model, coarse grid (${heightM} m AGL)`;
}
