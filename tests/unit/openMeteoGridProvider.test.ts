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
  it("comma-joins all point coordinates in request order, requesting hourly wind at all 4 model heights (§ FlyWeather GUI Reorganization + Coherent Height Wind)", () => {
    const url = buildGridUrl(POINTS);
    const params = new URL(url).searchParams;
    expect(params.get("latitude")).toBe("55.4000,55.9000,56.2000");
    expect(params.get("longitude")).toBe("13.0000,12.7000,14.0000");
    expect(params.get("hourly")).toBe(
      "wind_speed_10m,wind_direction_10m,wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m,wind_speed_180m,wind_direction_180m",
    );
    expect(params.get("wind_speed_unit")).toBe("ms");
    expect(params.get("forecast_days")).toBe("5");
  });
});

describe("normalizeGridResponse", () => {
  it("maps each response entry back onto its requested point by index, sharing one hours array, with a heights record per point", () => {
    const raw = [
      {
        latitude: 55.4,
        longitude: 13.0,
        hourly: {
          time: HOURS,
          wind_speed_10m: [5.6, 5.8, 6.0],
          wind_direction_10m: [182, 183, 184],
          wind_speed_80m: [8.1, 8.2, 8.3],
          wind_direction_80m: [190, 191, 192],
          wind_speed_120m: [9.1, 9.2, 9.3],
          wind_direction_120m: [195, 196, 197],
          wind_speed_180m: [11.1, 11.2, 11.3],
          wind_direction_180m: [200, 201, 202],
        },
      },
    ];
    const result = normalizeGridResponse([POINTS[0]], raw);
    expect(result.hours).toEqual(HOURS);
    expect(result.points).toHaveLength(1);
    const [p] = result.points;
    expect(p.lat).toBe(55.4);
    expect(p.lon).toBe(13.0);
    expect(p.heights[10]).toEqual({ windDirectionDeg: [182, 183, 184], windSpeedMs: [5.6, 5.8, 6.0] });
    expect(p.heights[80]).toEqual({ windDirectionDeg: [190, 191, 192], windSpeedMs: [8.1, 8.2, 8.3] });
    expect(p.heights[120]).toEqual({ windDirectionDeg: [195, 196, 197], windSpeedMs: [9.1, 9.2, 9.3] });
    expect(p.heights[180]).toEqual({ windDirectionDeg: [200, 201, 202], windSpeedMs: [11.1, 11.2, 11.3] });
  });

  it("returns null-filled series at every height for a missing/short response rather than crashing", () => {
    const result = normalizeGridResponse(POINTS, []);
    expect(result.hours).toEqual([]);
    expect(result.points).toHaveLength(3);
    for (const h of [10, 80, 120, 180] as const) {
      expect(result.points[0].heights[h]).toEqual({ windDirectionDeg: [], windSpeedMs: [] });
    }
  });

  it("keeps each height's series independent - a gap in one height's data never bleeds into another", () => {
    const raw = [
      {
        latitude: 55.4,
        longitude: 13.0,
        hourly: {
          time: HOURS,
          wind_speed_10m: [5.6, 5.8, 6.0],
          wind_direction_10m: [182, 183, 184],
          // 80/120/180m omitted entirely - e.g. a provider hiccup for just those variables
        },
      },
    ];
    const result = normalizeGridResponse([POINTS[0]], raw);
    const [p] = result.points;
    expect(p.heights[10].windSpeedMs).toEqual([5.6, 5.8, 6.0]);
    expect(p.heights[80].windSpeedMs).toEqual([null, null, null]);
    expect(p.heights[120].windSpeedMs).toEqual([null, null, null]);
    expect(p.heights[180].windSpeedMs).toEqual([null, null, null]);
  });
});

describe("fetchWindGrid batching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function multiHeightEntry(lat: number) {
    return {
      latitude: lat,
      longitude: 13,
      hourly: {
        time: HOURS,
        wind_speed_10m: [5, 5, 5],
        wind_direction_10m: [180, 180, 180],
        wind_speed_80m: [8, 8, 8],
        wind_direction_80m: [180, 180, 180],
        wind_speed_120m: [9, 9, 9],
        wind_direction_120m: [180, 180, 180],
        wind_speed_180m: [11, 11, 11],
        wind_direction_180m: [180, 180, 180],
      },
    };
  }

  it("splits a point set larger than the per-request cap into multiple parallel requests, preserves order, and shares one hours array", async () => {
    const points: GridPoint[] = Array.from({ length: 900 }, (_, i) => ({ lat: 55 + i * 0.001, lon: 13 }));
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const lats = params.get("latitude")!.split(",");
      const entries = lats.map((lat) => multiHeightEntry(Number(lat)));
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
    // every height genuinely present, not just 10m
    expect(result.points[0].heights[180].windSpeedMs).toEqual([11, 11, 11]);
  });

  it("returns an empty result without fetching for an empty point set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchWindGrid([]);
    expect(result).toEqual({ hours: [], points: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
