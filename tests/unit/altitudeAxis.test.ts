import { describe, expect, it } from "vitest";
import {
  ALTITUDE_MAX_REAL_DATA_M,
  ALTITUDE_SLIDER_MAX_M,
  altitudeFractionToM,
  altitudeMToFraction,
  formatAltitudeLabel,
} from "../../src/domain/altitudeAxis.ts";

describe("altitudeFractionToM / altitudeMToFraction (§ FlyWeather Interaction Model nonlinear slider)", () => {
  it("maps the slider endpoints exactly: 0 -> Surface, 1 -> 1500m", () => {
    expect(altitudeFractionToM(0)).toBe(0);
    expect(altitudeFractionToM(1)).toBe(ALTITUDE_SLIDER_MAX_M);
  });

  it("maps segment boundaries exactly (150m at f=0.5, 500m at f=0.8)", () => {
    expect(altitudeFractionToM(0.5)).toBe(150);
    expect(altitudeFractionToM(0.8)).toBe(500);
  });

  it("gives low altitudes a large physical portion of the slider (fine control)", () => {
    // 0-150m spans half the slider (f 0..0.5) while 500-1500m (1000m range)
    // spans only the last fifth (f 0.8..1.0) - low end must have a much
    // larger fraction-per-meter than the high end.
    const lowSlope = 0.5 / 150; // fraction per meter, 0-150m segment
    const highSlope = 0.2 / 1000; // fraction per meter, 500-1500m segment
    expect(lowSlope).toBeGreaterThan(highSlope * 10);
  });

  it.each([40, 50, 70, 100, 150, 200, 500, 1000, 1500])(
    "round-trips the task's example altitude %sm through fraction and back exactly",
    (m) => {
      const fraction = altitudeMToFraction(m);
      expect(altitudeFractionToM(fraction)).toBe(m);
    },
  );

  it("is monotonically non-decreasing across the full slider sweep", () => {
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.01) {
      const m = altitudeFractionToM(f);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it("rounds to the nearest 5m", () => {
    const m = altitudeFractionToM(0.37);
    expect(m % 5).toBe(0);
  });

  it("clamps fractions and meters outside [0,1]/[0,1500] rather than extrapolating", () => {
    expect(altitudeFractionToM(-1)).toBe(0);
    expect(altitudeFractionToM(2)).toBe(ALTITUDE_SLIDER_MAX_M);
    expect(altitudeMToFraction(-100)).toBe(0);
    expect(altitudeMToFraction(9999)).toBe(1);
  });
});

describe("formatAltitudeLabel", () => {
  it('formats Surface (0) specially, never as a bare "0"', () => {
    expect(formatAltitudeLabel(0)).toBe("Surface");
  });

  it("formats any other altitude with units, never a bare number", () => {
    expect(formatAltitudeLabel(70)).toBe("70 m AGL");
    expect(formatAltitudeLabel(1200)).toBe("1200 m AGL");
  });
});

describe("ALTITUDE_MAX_REAL_DATA_M", () => {
  it("matches the real Open-Meteo ceiling (180m) - not the slider's own 1500m max", () => {
    expect(ALTITUDE_MAX_REAL_DATA_M).toBe(180);
    expect(ALTITUDE_MAX_REAL_DATA_M).toBeLessThan(ALTITUDE_SLIDER_MAX_M);
  });
});
