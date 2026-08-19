import { describe, expect, it } from "vitest";
import { buildWindGrid } from "../../src/domain/windGrid.ts";

describe("buildWindGrid", () => {
  const bounds = { minLat: 55.0, maxLat: 56.0, minLon: 13.0, maxLon: 14.0 };

  it("produces resolution^2 points", () => {
    expect(buildWindGrid(bounds, 6)).toHaveLength(36);
    expect(buildWindGrid(bounds, 3)).toHaveLength(9);
  });

  it("pads outward beyond the raw bounds", () => {
    const points = buildWindGrid(bounds, 4);
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    expect(Math.min(...lats)).toBeLessThan(bounds.minLat);
    expect(Math.max(...lats)).toBeGreaterThan(bounds.maxLat);
    expect(Math.min(...lons)).toBeLessThan(bounds.minLon);
    expect(Math.max(...lons)).toBeGreaterThan(bounds.maxLon);
  });

  it("covers the corners within the padded range", () => {
    const points = buildWindGrid(bounds, 5);
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    expect(Math.min(...lats)).toBeCloseTo(bounds.minLat - 0.15, 5);
    expect(Math.max(...lats)).toBeCloseTo(bounds.maxLat + 0.15, 5);
    expect(Math.min(...lons)).toBeCloseTo(bounds.minLon - 0.15, 5);
    expect(Math.max(...lons)).toBeCloseTo(bounds.maxLon + 0.15, 5);
  });

  it("handles a degenerate (zero-span) bounds without dividing by zero", () => {
    const point = buildWindGrid({ minLat: 55.5, maxLat: 55.5, minLon: 13.5, maxLon: 13.5 }, 4);
    expect(point).toHaveLength(16);
    for (const p of point) {
      expect(Number.isFinite(p.lat)).toBe(true);
      expect(Number.isFinite(p.lon)).toBe(true);
    }
  });
});
