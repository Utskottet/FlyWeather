import { describe, expect, it } from "vitest";
import {
  describeRingSector,
  isAngleInSector,
  normalizeDeg,
  polarToCartesian,
  sectorMidpointDeg,
  sectorSweepDeg,
} from "../../src/domain/direction.ts";

describe("normalizeDeg", () => {
  it("passes through values already in [0, 360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(180)).toBe(180);
    expect(normalizeDeg(359.9)).toBeCloseTo(359.9);
  });

  it("wraps values >= 360", () => {
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(370)).toBeCloseTo(10);
  });

  it("wraps negative values", () => {
    expect(normalizeDeg(-10)).toBeCloseTo(350);
    expect(normalizeDeg(-360)).toBeCloseTo(0);
  });
});

describe("polarToCartesian (north-up geometry, §29.1)", () => {
  const cx = 50;
  const cy = 50;
  const r = 40;

  it("0deg (N) points straight up", () => {
    const p = polarToCartesian(cx, cy, r, 0);
    expect(p.x).toBeCloseTo(cx);
    expect(p.y).toBeCloseTo(cy - r);
  });

  it("90deg (E) points right", () => {
    const p = polarToCartesian(cx, cy, r, 90);
    expect(p.x).toBeCloseTo(cx + r);
    expect(p.y).toBeCloseTo(cy);
  });

  it("180deg (S) points down - a south sector sits on the south side (§29.2)", () => {
    const p = polarToCartesian(cx, cy, r, 180);
    expect(p.x).toBeCloseTo(cx);
    expect(p.y).toBeCloseTo(cy + r);
  });

  it("270deg (W) points left", () => {
    const p = polarToCartesian(cx, cy, r, 270);
    expect(p.x).toBeCloseTo(cx - r);
    expect(p.y).toBeCloseTo(cy);
  });

  it("225deg wind arrow points to the SW quadrant (§29.3)", () => {
    const p = polarToCartesian(cx, cy, r, 225);
    expect(p.x).toBeLessThan(cx); // west component
    expect(p.y).toBeGreaterThan(cy); // south component
  });
});

describe("sectorSweepDeg / sectorMidpointDeg", () => {
  it("computes a simple non-wrapping sweep", () => {
    expect(sectorSweepDeg(200, 250)).toBeCloseTo(50);
    expect(sectorMidpointDeg(200, 250)).toBeCloseTo(225);
  });

  it("handles a wrap-around sector 337.5 -> 22.5 (§29.4)", () => {
    expect(sectorSweepDeg(337.5, 22.5)).toBeCloseTo(45);
    expect(sectorMidpointDeg(337.5, 22.5)).toBeCloseTo(0);
  });
});

describe("isAngleInSector (deterministic boundaries, §5.2)", () => {
  it("is inclusive of the start angle and exclusive of the end angle", () => {
    expect(isAngleInSector(200, 200, 250)).toBe(true);
    expect(isAngleInSector(250, 200, 250)).toBe(false);
  });

  it("returns true for angles strictly inside a normal sector", () => {
    expect(isAngleInSector(225, 200, 250)).toBe(true);
  });

  it("returns false for angles outside a normal sector", () => {
    expect(isAngleInSector(199, 200, 250)).toBe(false);
    expect(isAngleInSector(251, 200, 250)).toBe(false);
  });

  it("handles a wrap-around sector 337.5 -> 22.5 correctly (§29.4)", () => {
    expect(isAngleInSector(0, 337.5, 22.5)).toBe(true);
    expect(isAngleInSector(350, 337.5, 22.5)).toBe(true);
    expect(isAngleInSector(10, 337.5, 22.5)).toBe(true);
    expect(isAngleInSector(22.5, 337.5, 22.5)).toBe(false); // exclusive end
    expect(isAngleInSector(180, 337.5, 22.5)).toBe(false);
  });
});

describe("describeRingSector", () => {
  it("produces a non-empty path for a normal sector", () => {
    const d = describeRingSector(50, 50, 20, 40, 200, 250);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("A 40 40");
    expect(d).toContain("A 20 20");
  });

  it("produces a valid path for a wrap-around sector 337.5 -> 22.5 (§29.4)", () => {
    const d = describeRingSector(50, 50, 20, 40, 337.5, 22.5);
    expect(d.startsWith("M ")).toBe(true);
    // a 45deg sweep should use the small-arc flag, not the large-arc flag
    expect(d).toContain("A 40 40 0 0 1");
  });

  it("uses the large-arc flag for a sweep greater than 180deg", () => {
    const d = describeRingSector(50, 50, 20, 40, 0, 270);
    expect(d).toContain("A 40 40 0 1 1");
  });
});
