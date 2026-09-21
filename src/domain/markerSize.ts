/**
 * How big a rose is drawn, by how far in the map is zoomed.
 *
 * Roses used to be one fixed size at every zoom, which is wrong at both
 * ends: too small to read when zoomed into a single hill, and a pile of
 * overlapping discs when zoomed out to look at southern Sweden.
 *
 * The sizes come from the real catalogue rather than taste. The closest
 * two sites are Arild and Mölle, 4.9 km apart, and the next few are 5-8
 * km; so at z10 (85 m/px) their centres are 57 px apart and anything up
 * to about that never collides. Below z8 a rose would have to be under
 * 15 px to guarantee no overlap, which is not a small rose but an
 * unreadable one - so the low end settles at a size that still shows a
 * wedge and accepts that the closest pair or two touch. Nobody plans a
 * flight at that zoom; they are looking at where the wind is.
 *
 * Interpolated rather than stepped, so a pinch grows the roses smoothly
 * instead of snapping them between sizes.
 */
const MARKER_SIZE_BY_ZOOM: [zoom: number, size: number][] = [
  [7, 26],
  [10, 54],
  // The map's own maxZoom, so the largest rose is the one you get when
  // you have zoomed all the way in on a single hill.
  [12, 96],
];
/** A selected rose is drawn larger, in the same proportion at every zoom. */
export const SELECTED_MARKER_SCALE = 1.25;

export function markerSizeForZoom(zoom: number): number {
  const [firstZoom, firstSize] = MARKER_SIZE_BY_ZOOM[0];
  const [lastZoom, lastSize] = MARKER_SIZE_BY_ZOOM[MARKER_SIZE_BY_ZOOM.length - 1];
  if (zoom <= firstZoom) return firstSize;
  if (zoom >= lastZoom) return lastSize;

  for (let i = 1; i < MARKER_SIZE_BY_ZOOM.length; i++) {
    const [z0, s0] = MARKER_SIZE_BY_ZOOM[i - 1];
    const [z1, s1] = MARKER_SIZE_BY_ZOOM[i];
    if (zoom <= z1) {
      // Rounded to whole pixels so a slow pinch does not re-render the
      // markers on every fractional zoom change.
      return Math.round(s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0));
    }
  }
  return lastSize;
}
