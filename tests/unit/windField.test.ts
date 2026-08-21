import { describe, expect, it } from "vitest";
import { buildWindFieldGrid, sampleWindField, speedToColor } from "../../src/domain/windField.ts";
import type { WindGridPoint } from "../../src/domain/types.ts";

function point(lat: number, lon: number, dirFrom: number | null, speedMs: number | null): WindGridPoint {
  return { lat, lon, windDirectionDeg: [dirFrom], windSpeedMs: [speedMs] };
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

describe("buildWindFieldGrid", () => {
  it("returns null for an empty point list", () => {
    expect(buildWindFieldGrid([], 0)).toBeNull();
  });

  it("returns null for a non-square point count (never fabricate a grid shape)", () => {
    expect(buildWindFieldGrid([point(55, 13, 0, 5), point(55, 14, 0, 5), point(56, 13, 0, 5)], 0)).toBeNull();
  });

  it("derives cols/rows from sqrt(length) and computes bounds", () => {
    const g = buildWindFieldGrid(grid2x2(), 0);
    expect(g).not.toBeNull();
    expect(g!.cols).toBe(2);
    expect(g!.rows).toBe(2);
    expect(g!.minLat).toBe(55.0);
    expect(g!.maxLat).toBe(56.0);
    expect(g!.minLon).toBe(13.0);
    expect(g!.maxLon).toBe(14.0);
  });

  it("converts FROM-direction to a TOWARD flow vector (+180, same convention as WindArrow.tsx)", () => {
    const g = buildWindFieldGrid(grid2x2(), 0)!;
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
    const g = buildWindFieldGrid(points, 0)!;
    expect(Number.isNaN(g.u[0])).toBe(true);
    expect(Number.isNaN(g.speedMs[0])).toBe(true);
  });

  it("indexes into each point's array at the given slider index", () => {
    const points: WindGridPoint[] = [
      { lat: 55, lon: 13, windDirectionDeg: [0, 90], windSpeedMs: [5, 10] },
      { lat: 55, lon: 14, windDirectionDeg: [0, 90], windSpeedMs: [5, 10] },
      { lat: 56, lon: 13, windDirectionDeg: [0, 90], windSpeedMs: [5, 10] },
      { lat: 56, lon: 14, windDirectionDeg: [0, 90], windSpeedMs: [5, 10] },
    ];
    const atNow = buildWindFieldGrid(points, 0)!;
    const atPlus1 = buildWindFieldGrid(points, 1)!;
    expect(atNow.speedMs[0]).toBe(5);
    expect(atPlus1.speedMs[0]).toBe(10);
    expect(atNow.u[0]).not.toBeCloseTo(atPlus1.u[0], 2);
  });
});

describe("sampleWindField", () => {
  it("returns null outside the grid's bounds", () => {
    const g = buildWindFieldGrid(grid2x2(), 0)!;
    expect(sampleWindField(g, 54.0, 13.5)).toBeNull();
    expect(sampleWindField(g, 55.5, 12.0)).toBeNull();
  });

  it("returns the exact cell value at a grid corner", () => {
    const g = buildWindFieldGrid(grid2x2(), 0)!;
    const sample = sampleWindField(g, 55.0, 13.0);
    expect(sample).not.toBeNull();
    expect(sample!.u).toBeCloseTo(0, 5);
    expect(sample!.v).toBeCloseTo(-1, 5);
    expect(sample!.speedMs).toBeCloseTo(5, 5);
  });

  it("blends smoothly between cells rather than jumping (bilinear interpolation)", () => {
    const g = buildWindFieldGrid(grid2x2(), 0)!;
    const center = sampleWindField(g, 55.5, 13.5)!;
    // Center of the 2x2 grid should be roughly the average of all 4 corner vectors, not any single one.
    expect(center.speedMs).toBeCloseTo(5, 5);
    expect(Math.abs(center.u)).toBeLessThan(1);
    expect(Math.abs(center.v)).toBeLessThan(1);
  });

  it("skips NaN cells and blends only the cells with real data", () => {
    const points = grid2x2();
    points[0] = point(55.0, 13.0, null, null); // NaN this corner
    const g = buildWindFieldGrid(points, 0)!;
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
