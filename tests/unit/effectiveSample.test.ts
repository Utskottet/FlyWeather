import { describe, expect, it } from "vitest";
import { selectEffectiveSample } from "../../src/domain/effectiveSample.ts";
import type { WindSample } from "../../src/domain/types.ts";

const now = new Date("2026-08-18T12:00:00Z");
const forecastPoint = { windDirectionDeg: 200, windSpeedMs: 4, windGustMs: 6 };

function liveSample(minutesAgo: number): WindSample {
  return {
    sourceId: "holfuy",
    sourceKind: "observation",
    timestamp: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    windDirectionDeg: 225,
    windSpeedMs: 5,
    windGustMs: 8,
  };
}

describe("selectEffectiveSample (§6.1)", () => {
  it("uses a fresh live observation at NOW, labeled observation", () => {
    const result = selectEffectiveSample(true, liveSample(2), forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).toBe("observation");
    expect(result.windDirectionDeg).toBe(225);
    expect(result.freshness).toBe("fresh");
  });

  it("uses an aging (not yet stale) live observation at NOW", () => {
    const result = selectEffectiveSample(true, liveSample(20), forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).toBe("observation");
    expect(result.freshness).toBe("aging");
  });

  it("falls back to forecast when the live observation is stale (§11.2 - never masquerades as current)", () => {
    const result = selectEffectiveSample(true, liveSample(45), forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).toBe("forecast");
    expect(result.windDirectionDeg).toBe(200);
  });

  it("falls back to forecast at NOW when there is no live sample at all", () => {
    const result = selectEffectiveSample(true, null, forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).toBe("forecast");
  });

  it("never uses live data away from NOW, even if fresh", () => {
    const result = selectEffectiveSample(false, liveSample(1), forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).toBe("forecast");
    expect(result.windDirectionDeg).toBe(200);
  });

  it("never labels a forecast value as an observation", () => {
    const result = selectEffectiveSample(true, liveSample(45), forecastPoint, now, 10, 30, 10);
    expect(result.sourceKind).not.toBe("observation");
  });
  it("names the point forecast as the source at the heights it answers at", () => {
    for (const heightM of [10, 100]) {
      const result = selectEffectiveSample(true, null, forecastPoint, now, 10, 30, heightM);
      expect(result.sourceId).toBe("open-meteo");
    }
  });

  it("names the regional grid as the source above the point forecast's heights", () => {
    // The bug in docs/FORECAST_INTEGRITY.md was not only a wrong number -
    // it was a wrong number labelled with somebody else's name.
    const result = selectEffectiveSample(true, null, forecastPoint, now, 10, 30, 350);
    expect(result.sourceId).toBe("regional-grid");
  });

  it("claims no forecast source at all when no height is shown", () => {
    const result = selectEffectiveSample(true, null, forecastPoint, now, 10, 30, null);
    expect(result.sourceId).toBeNull();
  });
});
