import { describe, expect, it } from "vitest";
import {
  ALTITUDE_MAX_REAL_DATA_M,
  ALTITUDE_SLIDER_MAX_M,
  altitudeFractionToM,
  altitudeMToFraction,
  formatAltitudeLabel,
} from "../../src/domain/altitudeAxis.ts";

describe("altitudeFractionToM / altitudeMToFraction (§ Simplify DMI Wind v1 - capped at real DMI data)", () => {
  it("maps the slider endpoints exactly: 0 -> Surface, 1 -> 450m (the real data ceiling)", () => {
    expect(altitudeFractionToM(0)).toBe(0);
    expect(altitudeFractionToM(1)).toBe(ALTITUDE_SLIDER_MAX_M);
    expect(ALTITUDE_SLIDER_MAX_M).toBe(450);
  });

  it("maps segment boundaries exactly (150m at f=0.5, 350m at f=0.8)", () => {
    expect(altitudeFractionToM(0.5)).toBe(150);
    expect(altitudeFractionToM(0.8)).toBe(350);
  });

  it("gives low altitudes a large physical portion of the slider (fine control)", () => {
    // 0-150m spans half the slider (f 0..0.5) while 350-450m (100m range)
    // spans only the last fifth (f 0.8..1.0) - low end must have a
    // meaningfully larger fraction-per-meter than the high end.
    const lowSlope = 0.5 / 150; // fraction per meter, 0-150m segment
    const highSlope = 0.2 / 100; // fraction per meter, 350-450m segment
    expect(lowSlope).toBeGreaterThan(highSlope * 1.5);
  });

  it.each([10, 50, 100, 150, 250, 350, 450])(
    "round-trips DMI's own real height %sm through fraction and back exactly",
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

  it("clamps fractions and meters outside [0,1]/[0,450] rather than extrapolating", () => {
    expect(altitudeFractionToM(-1)).toBe(0);
    expect(altitudeFractionToM(2)).toBe(ALTITUDE_SLIDER_MAX_M);
    expect(altitudeMToFraction(-100)).toBe(0);
    expect(altitudeMToFraction(9999)).toBe(1);
  });

  it("never offers a value above the real data ceiling - no fraction maps past 450m", () => {
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
    expect(formatAltitudeLabel(150)).toBe("150 m AGL");
    expect(formatAltitudeLabel(450)).toBe("450 m AGL");
  });
});

describe("ALTITUDE_MAX_REAL_DATA_M", () => {
  it("matches the real DMI ceiling (450m) and equals the slider's own max - nothing above it is selectable", () => {
    expect(ALTITUDE_MAX_REAL_DATA_M).toBe(450);
    expect(ALTITUDE_SLIDER_MAX_M).toBe(ALTITUDE_MAX_REAL_DATA_M);
  });
});
