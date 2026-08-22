import { describe, expect, it } from "vitest";
import {
  ALTITUDE_MAX_REAL_DATA_M,
  ALTITUDE_SLIDER_MAX_M,
  altitudeFractionToM,
  altitudeMToFraction,
  formatAltitudeLabel,
} from "../../src/domain/altitudeAxis.ts";

describe("altitudeFractionToM / altitudeMToFraction (§ FlyWeather Mobile UI Correction - capped at real data)", () => {
  it("maps the slider endpoints exactly: 0 -> Surface, 1 -> 180m (the real data ceiling)", () => {
    expect(altitudeFractionToM(0)).toBe(0);
    expect(altitudeFractionToM(1)).toBe(ALTITUDE_SLIDER_MAX_M);
    expect(ALTITUDE_SLIDER_MAX_M).toBe(180);
  });

  it("maps segment boundaries exactly (70m at f=0.55, 120m at f=0.8)", () => {
    expect(altitudeFractionToM(0.55)).toBe(70);
    expect(altitudeFractionToM(0.8)).toBe(120);
  });

  it("gives low altitudes a large physical portion of the slider (fine control)", () => {
    // 0-70m spans more than half the slider (f 0..0.55) while 120-180m (60m
    // range) spans only the last fifth (f 0.8..1.0) - low end must have a
    // meaningfully larger fraction-per-meter than the high end.
    const lowSlope = 0.55 / 70; // fraction per meter, 0-70m segment
    const highSlope = 0.2 / 60; // fraction per meter, 120-180m segment
    expect(lowSlope).toBeGreaterThan(highSlope * 2);
  });

  it.each([40, 50, 70, 100, 120, 180])(
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

  it("clamps fractions and meters outside [0,1]/[0,180] rather than extrapolating", () => {
    expect(altitudeFractionToM(-1)).toBe(0);
    expect(altitudeFractionToM(2)).toBe(ALTITUDE_SLIDER_MAX_M);
    expect(altitudeMToFraction(-100)).toBe(0);
    expect(altitudeMToFraction(9999)).toBe(1);
  });

  it("never offers a value above the real data ceiling - no fraction maps past 180m", () => {
    for (let f = 0; f <= 1; f += 0.01) {
      expect(altitudeFractionToM(f)).toBeLessThanOrEqual(ALTITUDE_MAX_REAL_DATA_M);
    }
  });
});

describe("formatAltitudeLabel", () => {
  it('formats Surface (0) specially, never as a bare "0"', () => {
    expect(formatAltitudeLabel(0)).toBe("Surface");
  });

  it("formats any other altitude with units, never a bare number", () => {
    expect(formatAltitudeLabel(70)).toBe("70 m AGL");
    expect(formatAltitudeLabel(180)).toBe("180 m AGL");
  });
});

describe("ALTITUDE_MAX_REAL_DATA_M", () => {
  it("matches the real Open-Meteo ceiling (180m) and equals the slider's own max - nothing above it is selectable", () => {
    expect(ALTITUDE_MAX_REAL_DATA_M).toBe(180);
    expect(ALTITUDE_SLIDER_MAX_M).toBe(ALTITUDE_MAX_REAL_DATA_M);
  });
});
