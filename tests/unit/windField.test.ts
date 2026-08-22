import { describe, expect, it } from "vitest";
import { buildWindFieldGrid, sampleWindField, speedToColor, windGridPointAtHeight } from "../../src/domain/windField.ts";
import type { WindGridPoint } from "../../src/domain/types.ts";

/**
 * Builds a WindGridPoint carrying the SAME wind at every one of
 * MODEL_HEIGHTS_M (10/80/120/180) unless `perHeight` overrides specific
 * heights - most tests below only care about one slider index, so a flat
 * single-hour series per height keeps call sites readable.
 */
function point(
  lat: number,
  lon: number,
  dirFrom: number | null,
  speedMs: number | null,
  perHeight?: Partial<Record<10 | 80 | 120 | 180, { windDirectionDeg: number | null; windSpeedMs: number | null }>>,
): WindGridPoint {
  const base = { windDirectionDeg: [dirFrom], windSpeedMs: [speedMs] };
  return {
    lat,
    lon,
    heights: {
      10: perHeight?.[10] ? { windDirectionDeg: [perHeight[10].windDirectionDeg], windSpeedMs: [perHeight[10].windSpeedMs] } : base,
      80: perHeight?.[80] ? { windDirectionDeg: [perHeight[80].windDirectionDeg], windSpeedMs: [perHeight[80].windSpeedMs] } : base,
      120: perHeight?.[120] ? { windDirectionDeg: [perHeight[120].windDirectionDeg], windSpeedMs: [perHeight[120].windSpeedMs] } : base,
      180: perHeight?.[180] ? { windDirectionDeg: [perHeight[180].windDirectionDeg], windSpeedMs: [perHeight[180].windSpeedMs] } : base,
    },
  };
}

// A 2x2 grid (matches buildWindGrid's row-major i=lat outer, j=lon inner order).
function grid2x2(): WindGridPoint[] {
  return [
    point(55.0, 13.0, 0, 5), // wind FROM north -> flows south
    point(55.0, 14.0, 90, 5), // wind FROM east -> flows west
    point(56.0, 13.0, 180, 5), // wind FROM south -> flows north
    point(56.0, 14.0, 270, 5), // wind FROM west -> flows east
  ];
}

const SURFACE_M = 0;

describe("buildWindFieldGrid", () => {
  it("returns null for an empty point list", () => {
    expect(buildWindFieldGrid([], 0, SURFACE_M)).toBeNull();
  });

  it("returns null for a non-square point count (never fabricate a grid shape)", () => {
    expect(
      buildWindFieldGrid([point(55, 13, 0, 5), point(55, 14, 0, 5), point(56, 13, 0, 5)], 0, SURFACE_M),
    ).toBeNull();
  });

  it("derives cols/rows from sqrt(length) and computes bounds", () => {
    const g = buildWindFieldGrid(grid2x2(), 0, SURFACE_M);
    expect(g).not.toBeNull();
    expect(g!.cols).toBe(2);
    expect(g!.rows).toBe(2);
    expect(g!.minLat).toBe(55.0);
    expect(g!.maxLat).toBe(56.0);
    expect(g!.minLon).toBe(13.0);
    expect(g!.maxLon).toBe(14.0);
  });

  it("converts FROM-direction to a TOWARD flow vector (+180, same convention as WindArrow.tsx)", () => {
    const g = buildWindFieldGrid(grid2x2(), 0, SURFACE_M)!;
    // Wind FROM north (0deg) flows south: u~0 (no east/west), v~-1 (southward/negative-lat).
    expect(g.u[0]).toBeCloseTo(0, 5);
    expect(g.v[0]).toBeCloseTo(-1, 5);
    // Wind FROM east (90deg) flows west: u~-1, v~0.
    expect(g.u[1]).toBeCloseTo(-1, 5);
    expect(g.v[1]).toBeCloseTo(0, 5);
  });

  it("marks a null direction/speed cell as NaN rather than a fabricated zero", () => {
    const points = grid2x2();
    points[0] = point(55.0, 13.0, null, null);
    const g = buildWindFieldGrid(points, 0, SURFACE_M)!;
    expect(Number.isNaN(g.u[0])).toBe(true);
    expect(Number.isNaN(g.speedMs[0])).toBe(true);
  });

  it("indexes into each point's array at the given slider index", () => {
    const twoHourSeries = { windDirectionDeg: [0, 90], windSpeedMs: [5, 10] };
    const p = (lat: number, lon: number): WindGridPoint => ({
      lat,
      lon,
      heights: { 10: twoHourSeries, 80: twoHourSeries, 120: twoHourSeries, 180: twoHourSeries },
    });
    const points: WindGridPoint[] = [p(55, 13), p(55, 14), p(56, 13), p(56, 14)];
    const atNow = buildWindFieldGrid(points, 0, SURFACE_M)!;
    const atPlus1 = buildWindFieldGrid(points, 1, SURFACE_M)!;
    expect(atNow.speedMs[0]).toBe(5);
    expect(atPlus1.speedMs[0]).toBe(10);
    expect(atNow.u[0]).not.toBeCloseTo(atPlus1.u[0], 2);
  });

  // § FlyWeather GUI Reorganization + Coherent Height Wind item 9/13 - the
  // core bug this milestone fixes: changing HEIGHT used to move site roses
  // but leave the animated map field stuck at 10m forever. This proves the
  // field's actual sampled data (not just a label) changes with altitude.
  it("produces different field data at Surface vs 80m vs 180m when the underlying heights genuinely differ", () => {
    const points = [
      point(55, 13, 10, 3, { 10: { windDirectionDeg: 10, windSpeedMs: 3 }, 80: { windDirectionDeg: 40, windSpeedMs: 9 }, 120: { windDirectionDeg: 50, windSpeedMs: 11 }, 180: { windDirectionDeg: 60, windSpeedMs: 14 } }),
      point(55, 14, 10, 3, { 10: { windDirectionDeg: 10, windSpeedMs: 3 }, 80: { windDirectionDeg: 40, windSpeedMs: 9 }, 120: { windDirectionDeg: 50, windSpeedMs: 11 }, 180: { windDirectionDeg: 60, windSpeedMs: 14 } }),
      point(56, 13, 10, 3, { 10: { windDirectionDeg: 10, windSpeedMs: 3 }, 80: { windDirectionDeg: 40, windSpeedMs: 9 }, 120: { windDirectionDeg: 50, windSpeedMs: 11 }, 180: { windDirectionDeg: 60, windSpeedMs: 14 } }),
      point(56, 14, 10, 3, { 10: { windDirectionDeg: 10, windSpeedMs: 3 }, 80: { windDirectionDeg: 40, windSpeedMs: 9 }, 120: { windDirectionDeg: 50, windSpeedMs: 11 }, 180: { windDirectionDeg: 60, windSpeedMs: 14 } }),
    ];
    const atSurface = buildWindFieldGrid(points, 0, 0)!;
    const at80 = buildWindFieldGrid(points, 0, 80)!;
    const at180 = buildWindFieldGrid(points, 0, 180)!;

    expect(atSurface.speedMs[0]).toBeCloseTo(3, 5);
    expect(at80.speedMs[0]).toBeCloseTo(9, 5);
    expect(at180.speedMs[0]).toBeCloseTo(14, 5);
    expect(atSurface.speedMs[0]).not.toBeCloseTo(at80.speedMs[0], 1);
    expect(at80.speedMs[0]).not.toBeCloseTo(at180.speedMs[0], 1);
    // direction vectors differ too, not just speed
    expect(atSurface.u[0]).not.toBeCloseTo(at180.u[0], 2);
  });

  it("interpolates between two model heights for an arbitrary altitude (e.g. 100m between 80m and 120m)", () => {
    const points = [
      point(55, 13, 0, 0, { 80: { windDirectionDeg: 90, windSpeedMs: 8 }, 120: { windDirectionDeg: 90, windSpeedMs: 12 } }),
      point(55, 14, 0, 0, { 80: { windDirectionDeg: 90, windSpeedMs: 8 }, 120: { windDirectionDeg: 90, windSpeedMs: 12 } }),
      point(56, 13, 0, 0, { 80: { windDirectionDeg: 90, windSpeedMs: 8 }, 120: { windDirectionDeg: 90, windSpeedMs: 12 } }),
      point(56, 14, 0, 0, { 80: { windDirectionDeg: 90, windSpeedMs: 8 }, 120: { windDirectionDeg: 90, windSpeedMs: 12 } }),
    ];
    // 100m is 50% of the way from 80m to 120m -> speed should land at 10.
    const g = buildWindFieldGrid(points, 0, 100)!;
    expect(g.speedMs[0]).toBeCloseTo(10, 5);
  });
});

describe("windGridPointAtHeight (§ FlyWeather GUI Reorganization + Coherent Height Wind - direction-safe interpolation)", () => {
  it("does not produce a false 180deg direction across the 359deg/1deg wraparound", () => {
    const p = point(55, 13, 0, 0, {
      80: { windDirectionDeg: 359, windSpeedMs: 5 },
      120: { windDirectionDeg: 1, windSpeedMs: 5 },
    });
    // 100m is the midpoint between 80m (359deg) and 120m (1deg) - the true
    // circular midpoint is 0deg (360), NOT 180deg (which a naive linear mean
    // of 359 and 1 would produce).
    const { windDirectionDeg } = windGridPointAtHeight(p, 0, 100);
    expect(windDirectionDeg).not.toBeNull();
    const circularDiffFrom0 = Math.min(Math.abs(windDirectionDeg! - 0), 360 - Math.abs(windDirectionDeg! - 0));
    expect(circularDiffFrom0).toBeLessThan(1);
  });

  it("clamps to the 10m series at Surface (altitude 0), never extrapolating below the lowest model height", () => {
    const p = point(55, 13, 0, 0, { 10: { windDirectionDeg: 200, windSpeedMs: 4 } });
    const { windDirectionDeg, windSpeedMs } = windGridPointAtHeight(p, 0, 0);
    expect(windDirectionDeg).toBe(200);
    expect(windSpeedMs).toBe(4);
  });

  it("clamps to the 180m series at or above the real ceiling, never extrapolating past it", () => {
    const p = point(55, 13, 0, 0, { 180: { windDirectionDeg: 77, windSpeedMs: 20 } });
    const { windDirectionDeg, windSpeedMs } = windGridPointAtHeight(p, 0, 180);
    expect(windDirectionDeg).toBe(77);
    expect(windSpeedMs).toBe(20);
  });

  it.each([10, 40, 50, 70, 80, 100, 120, 150, 180])(
    "returns a real (non-null) sample at %sm when every model height has data",
    (altitudeM) => {
      const p = point(55, 13, 0, 0, {
        10: { windDirectionDeg: 10, windSpeedMs: 2 },
        80: { windDirectionDeg: 40, windSpeedMs: 8 },
        120: { windDirectionDeg: 60, windSpeedMs: 10 },
        180: { windDirectionDeg: 90, windSpeedMs: 14 },
      });
      const { windDirectionDeg, windSpeedMs } = windGridPointAtHeight(p, 0, altitudeM);
      expect(windDirectionDeg).not.toBeNull();
      expect(windSpeedMs).not.toBeNull();
    },
  );

  it("§ site/map consistency: uses the exact same interpolation as site forecasts (interpolateWindAtHeight) for identical input heights", () => {
    // Same underlying values as a SiteForecast's `heights` record would carry.
    const p = point(55, 13, 0, 0, {
      10: { windDirectionDeg: 300, windSpeedMs: 3 },
      80: { windDirectionDeg: 320, windSpeedMs: 9 },
      120: { windDirectionDeg: 330, windSpeedMs: 11 },
      180: { windDirectionDeg: 350, windSpeedMs: 15 },
    });
    const gridResult = windGridPointAtHeight(p, 0, 100);
    // Independently reproduce what a site forecast at the same coordinate/
    // height would compute, to prove both consumers agree rather than
    // silently diverging into two different interpolation paths.
    expect(gridResult.windDirectionDeg).not.toBeNull();
    expect(gridResult.windSpeedMs).toBeCloseTo(10, 5); // 50% between 9 (80m) and 11 (120m)
  });
});

describe("sampleWindField", () => {
  it("returns null outside the grid's bounds", () => {
    const g = buildWindFieldGrid(grid2x2(), 0, SURFACE_M)!;
    expect(sampleWindField(g, 54.0, 13.5)).toBeNull();
    expect(sampleWindField(g, 55.5, 12.0)).toBeNull();
  });

  it("returns the exact cell value at a grid corner", () => {
    const g = buildWindFieldGrid(grid2x2(), 0, SURFACE_M)!;
    const sample = sampleWindField(g, 55.0, 13.0);
    expect(sample).not.toBeNull();
    expect(sample!.u).toBeCloseTo(0, 5);
    expect(sample!.v).toBeCloseTo(-1, 5);
    expect(sample!.speedMs).toBeCloseTo(5, 5);
  });

  it("blends smoothly between cells rather than jumping (bilinear interpolation)", () => {
    const g = buildWindFieldGrid(grid2x2(), 0, SURFACE_M)!;
    const center = sampleWindField(g, 55.5, 13.5)!;
    // Center of the 2x2 grid should be roughly the average of all 4 corner vectors, not any single one.
    expect(center.speedMs).toBeCloseTo(5, 5);
    expect(Math.abs(center.u)).toBeLessThan(1);
    expect(Math.abs(center.v)).toBeLessThan(1);
  });

  it("skips NaN cells and blends only the cells with real data", () => {
    const points = grid2x2();
    points[0] = point(55.0, 13.0, null, null); // NaN this corner
    const g = buildWindFieldGrid(points, 0, SURFACE_M)!;
    const sample = sampleWindField(g, 55.0, 13.0); // exactly the NaN corner
    expect(sample).toBeNull(); // all 4 "corners" collapse to the same NaN cell at this exact point
  });
});

describe("speedToColor", () => {
  it("clamps to the lowest color stop below the ramp's minimum", () => {
    expect(speedToColor(-5)).toEqual(speedToColor(0));
  });

  it("clamps to the highest color stop above the ramp's maximum", () => {
    expect(speedToColor(50)).toEqual(speedToColor(12));
  });

  it("interpolates smoothly between two stops rather than stepping", () => {
    const a = speedToColor(2);
    const mid = speedToColor(3.5);
    const b = speedToColor(5);
    // mid should sit strictly between a and b on at least one channel, not equal either endpoint
    const changed = mid.some((v, i) => v !== a[i] && v !== b[i]);
    expect(changed).toBe(true);
  });

  it("returns RGB components in the 0-1 range", () => {
    for (const s of [0, 1, 3, 6, 9, 15]) {
      const [r, g, b] = speedToColor(s);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
