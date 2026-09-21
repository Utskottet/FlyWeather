import { describe, expect, it } from "vitest";
import { SELECTED_MARKER_SCALE, markerSizeForZoom } from "../../src/domain/markerSize.ts";

/**
 * Roses used to be one size at every zoom: too small to read on a single
 * hill, a pile of overlapping discs across southern Sweden. The sizes
 * here come from the real catalogue - the closest two sites are Arild and
 * Mölle, 4.9 km apart.
 */

/** Metres per pixel at a given zoom, at the latitude these sites sit at. */
function metresPerPixel(zoom: number, lat = 56): number {
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

describe("how big a rose is drawn", () => {
  it("grows as you zoom in, and never shrinks", () => {
    const sizes = [6, 7, 8, 9, 10, 11, 12].map(markerSizeForZoom);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `z${i + 6} should not be smaller than z${i + 5}`).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });

  it("is twice the old fixed size when zoomed right in", () => {
    // The old size was 48 at every zoom.
    expect(markerSizeForZoom(12)).toBe(96);
  });

  it("does not overlap the closest pair of sites at regional zoom", () => {
    // Arild and Mölle are 4.9 km apart. At z10 that is 57 px between
    // centres, so a rose has to be under that to sit clear.
    const separationPx = 4890 / metresPerPixel(10);
    expect(markerSizeForZoom(10)).toBeLessThan(separationPx);
  });

  it("stays readable when zoomed out, rather than shrinking to a speck", () => {
    // Guaranteeing no overlap at z6 would need a 3.6 px marker. That is
    // not a small rose, it is a dot with no wedge and no number - so the
    // low end stops at something that can still be read and lets the
    // closest pair touch.
    expect(markerSizeForZoom(6)).toBeGreaterThanOrEqual(24);
  });

  it("is flat outside the range rather than running away", () => {
    expect(markerSizeForZoom(1)).toBe(markerSizeForZoom(7));
    expect(markerSizeForZoom(22)).toBe(markerSizeForZoom(12));
  });

  it("interpolates between the breakpoints, so a pinch grows smoothly", () => {
    const mid = markerSizeForZoom(8.5);
    expect(mid).toBeGreaterThan(markerSizeForZoom(8));
    expect(mid).toBeLessThan(markerSizeForZoom(9));
  });

  it("returns whole pixels, so a slow pinch does not re-render on every frame", () => {
    for (const z of [7.1, 8.3, 9.7, 10.4, 11.9]) {
      expect(Number.isInteger(markerSizeForZoom(z)), `z${z}`).toBe(true);
    }
  });

  it("keeps a selected rose larger at every zoom", () => {
    expect(SELECTED_MARKER_SCALE).toBeGreaterThan(1);
  });
});
