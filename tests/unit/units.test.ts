import { describe, expect, it } from "vitest";
import { kmhToMs, knotsToMs, mphToMs, msToKmh, msToKnots, msToMph } from "../../src/domain/units.ts";

describe("wind speed unit conversions (§31)", () => {
  it("converts km/h to m/s and back", () => {
    expect(kmhToMs(36)).toBeCloseTo(10);
    expect(msToKmh(10)).toBeCloseTo(36);
  });

  it("converts mph to m/s and back", () => {
    expect(mphToMs(10)).toBeCloseTo(4.4704);
    expect(msToMph(4.4704)).toBeCloseTo(10);
  });

  it("converts knots to m/s and back", () => {
    expect(knotsToMs(10)).toBeCloseTo(5.14444);
    expect(msToKnots(5.14444)).toBeCloseTo(10);
  });

  it("round-trips without drift", () => {
    expect(msToKmh(kmhToMs(72))).toBeCloseTo(72);
    expect(msToMph(mphToMs(15))).toBeCloseTo(15);
    expect(msToKnots(knotsToMs(20))).toBeCloseTo(20);
  });
});
