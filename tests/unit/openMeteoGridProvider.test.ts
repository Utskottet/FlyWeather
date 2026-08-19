import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGridUrl, fetchWindGrid, normalizeGridResponse } from "../../src/providers/forecast/openMeteoGridProvider.ts";
import type { GridPoint } from "../../src/domain/windGrid.ts";

const POINTS = [
  { lat: 55.4, lon: 13.0 },
  { lat: 55.9, lon: 12.7 },
  { lat: 56.2, lon: 14.0 },
];

const HOURS = ["2026-08-19T00:00", "2026-08-19T01:00", "2026-08-19T02:00"];

describe("buildGridUrl", () => {
  it("comma-joins all point coordinates in request order, requesting hourly (not current) wind", () => {
    const url = buildGridUrl(POINTS);
    const params = new URL(url).searchParams;
    expect(params.get("latitude")).toBe("55.4000,55.9000,56.2000");
    expect(params.get("longitude")).toBe("13.0000,12.7000,14.0000");
    expect(params.get("hourly")).toBe("wind_speed_10m,wind_direction_10m");
    expect(params.get("wind_speed_unit")).toBe("ms");
    expect(params.get("forecast_days")).toBe("5");
  });
});

describe("normalizeGridResponse", () => {
  it("maps each response entry back onto its requested point by index, sharing one hours array", () => {
    const raw = [
      {
        latitude: 55.4,
        longitude: 13.0,
        hourly: { time: HOURS, wind_speed_10m: [5.6, 5.8, 6.0], wind_direction_10m: [182, 183, 184] },
      },
      {
        latitude: 55.9,
        longitude: 12.7,
        hourly: { time: HOURS, wind_speed_10m: [7.6, 7.5, 7.4], wind_direction_10m: [176, 177, 178] },
      },
      {
        latitude: 56.2,
        longitude: 14.0,
        hourly: { time: HOURS, wind_speed_10m: [4.1, 4.2, 4.3], wind_direction_10m: [200, 201, 202] },
      },
    ];
    const result = normalizeGridResponse(POINTS, raw);
    expect(result.hours).toEqual(HOURS);
    expect(result.points).toEqual([
      { lat: 55.4, lon: 13.0, windDirectionDeg: [182, 183, 184], windSpeedMs: [5.6, 5.8, 6.0] },
      { lat: 55.9, lon: 12.7, windDirectionDeg: [176, 177, 178], windSpeedMs: [7.6, 7.5, 7.4] },
      { lat: 56.2, lon: 14.0, windDirectionDeg: [200, 201, 202], windSpeedMs: [4.1, 4.2, 4.3] },
    ]);
  });

  it("returns null-filled series for a missing/short response rather than crashing", () => {
    const result = normalizeGridResponse(POINTS, []);
    expect(result.hours).toEqual([]);
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toEqual({ lat: 55.4, lon: 13.0, windDirectionDeg: [], windSpeedMs: [] });
  });
});

describe("fetchWindGrid batching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits a point set larger than the per-request cap into multiple parallel requests, preserves order, and shares one hours array", async () => {
    const points: GridPoint[] = Array.from({ length: 900 }, (_, i) => ({ lat: 55 + i * 0.001, lon: 13 }));
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const lats = params.get("latitude")!.split(",");
      const entries = lats.map((lat) => ({
        latitude: Number(lat),
        longitude: 13,
        hourly: { time: HOURS, wind_speed_10m: [5, 5, 5], wind_direction_10m: [180, 180, 180] },
      }));
      return { ok: true, json: async () => entries } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWindGrid(points);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // 900 points exceeds the per-request cap
    expect(result.hours).toEqual(HOURS);
    expect(result.points).toHaveLength(900);
    // order preserved: first result point matches the first requested point
    expect(result.points[0].lat).toBeCloseTo(points[0].lat, 6);
    expect(result.points[899].lat).toBeCloseTo(points[899].lat, 6);
  });

  it("returns an empty result without fetching for an empty point set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchWindGrid([]);
    expect(result).toEqual({ hours: [], points: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
