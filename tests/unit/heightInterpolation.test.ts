import { describe, expect, it } from "vitest";
import { interpolateWindAtHeight } from "../../src/domain/heightInterpolation.ts";

const SAMPLES = [
  { heightM: 10, windDirectionDeg: 268, windSpeedMs: 3.4 },
  { heightM: 80, windDirectionDeg: 303, windSpeedMs: 8.0 },
  { heightM: 120, windDirectionDeg: 303, windSpeedMs: 8.4 },
  { heightM: 180, windDirectionDeg: 306, windSpeedMs: 10.3 },
];

describe("interpolateWindAtHeight (§7.2)", () => {
  it("returns the exact sample when the target height matches one directly", () => {
    const result = interpolateWindAtHeight(80, SAMPLES);
    expect(result.windDirectionDeg).toBe(303);
    expect(result.windSpeedMs).toBe(8.0);
    expect(result.effectiveHeightM).toBe(80);
  });

  it("linearly interpolates speed between two bracketing heights", () => {
    const result = interpolateWindAtHeight(100, SAMPLES); // halfway between 80 and 120
    expect(result.windSpeedMs).toBeCloseTo(8.2);
    expect(result.effectiveHeightM).toBe(100);
  });

  it("interpolates direction circularly (handles wrap-around correctly)", () => {
    const wrapSamples = [
      { heightM: 10, windDirectionDeg: 350, windSpeedMs: 5 },
      { heightM: 80, windDirectionDeg: 10, windSpeedMs: 5 },
    ];
    const result = interpolateWindAtHeight(45, wrapSamples);
    // halfway between 350 and 10 should be ~0/360 (not 180, which naive linear averaging would give)
    const deg = result.windDirectionDeg!;
    const distanceFromZero = Math.min(deg, 360 - deg);
    expect(distanceFromZero).toBeLessThan(0.01);
  });

  it("clamps to the lowest sample rather than extrapolating below it", () => {
    const result = interpolateWindAtHeight(5, SAMPLES);
    expect(result.effectiveHeightM).toBe(10);
    expect(result.windDirectionDeg).toBe(268);
  });

  it("clamps to the highest sample rather than extrapolating above it (§7.2's 'use pressure-level data if available' - not available here, so clamp)", () => {
    const result = interpolateWindAtHeight(250, SAMPLES);
    expect(result.effectiveHeightM).toBe(180);
    expect(result.windSpeedMs).toBe(10.3);
  });

  it("returns nulls, not a guess, when no sample has data", () => {
    const result = interpolateWindAtHeight(100, [
      { heightM: 10, windDirectionDeg: null, windSpeedMs: null },
      { heightM: 80, windDirectionDeg: null, windSpeedMs: null },
    ]);
    expect(result.windDirectionDeg).toBeNull();
    expect(result.windSpeedMs).toBeNull();
    expect(result.effectiveHeightM).toBeNull();
  });

  it("skips samples with partial nulls and uses the remaining valid ones", () => {
    const result = interpolateWindAtHeight(50, [
      { heightM: 10, windDirectionDeg: null, windSpeedMs: null },
      { heightM: 80, windDirectionDeg: 303, windSpeedMs: 8.0 },
    ]);
    expect(result.windSpeedMs).toBe(8.0);
    expect(result.effectiveHeightM).toBe(80);
  });
});
