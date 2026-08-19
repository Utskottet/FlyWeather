import { describe, expect, it } from "vitest";
import { buildGridUrl, normalizeGridResponse } from "../../src/providers/forecast/openMeteoGridProvider.ts";

const POINTS = [
  { lat: 55.4, lon: 13.0 },
  { lat: 55.9, lon: 12.7 },
  { lat: 56.2, lon: 14.0 },
];

describe("buildGridUrl", () => {
  it("comma-joins all point coordinates in request order", () => {
    const url = buildGridUrl(POINTS);
    const params = new URL(url).searchParams;
    expect(params.get("latitude")).toBe("55.4000,55.9000,56.2000");
    expect(params.get("longitude")).toBe("13.0000,12.7000,14.0000");
    expect(params.get("current")).toBe("wind_speed_10m,wind_direction_10m");
    expect(params.get("wind_speed_unit")).toBe("ms");
  });
});

describe("normalizeGridResponse", () => {
  it("maps each response entry back onto its requested point by index", () => {
    const raw = [
      { latitude: 55.4, longitude: 13.0, current: { wind_speed_10m: 5.6, wind_direction_10m: 182 } },
      { latitude: 55.9, longitude: 12.7, current: { wind_speed_10m: 7.6, wind_direction_10m: 176 } },
      { latitude: 56.2, longitude: 14.0, current: { wind_speed_10m: 4.1, wind_direction_10m: 200 } },
    ];
    const result = normalizeGridResponse(POINTS, raw);
    expect(result).toEqual([
      { lat: 55.4, lon: 13.0, windDirectionDeg: 182, windSpeedMs: 5.6 },
      { lat: 55.9, lon: 12.7, windDirectionDeg: 176, windSpeedMs: 7.6 },
      { lat: 56.2, lon: 14.0, windDirectionDeg: 200, windSpeedMs: 4.1 },
    ]);
  });

  it("returns nulls for a missing/short response rather than crashing", () => {
    const result = normalizeGridResponse(POINTS, []);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lat: 55.4, lon: 13.0, windDirectionDeg: null, windSpeedMs: null });
  });
});
