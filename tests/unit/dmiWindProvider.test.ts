import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDmiHeightsMatch,
  fetchDmiWindGrid,
  fetchDmiWindManifestEntry,
  mergeDmiWindIntoSiteForecast,
} from "../../src/providers/forecast/dmiWindProvider.ts";
import { MODEL_HEIGHTS_M, type SiteForecast, type WindGridPoint } from "../../src/domain/types.ts";

const BASE_URL = "https://soaring.example";

function manifestWith(heightsM: number[] = [...MODEL_HEIGHTS_M]) {
  return {
    wind: {
      unit: "m/s",
      heightsM,
      grid: { bbox: [8.0, 54.2, 20.0, 60.7], cols: 2, rows: 2 },
      validTimes: ["2026-08-23T06:00:00Z", "2026-08-23T07:00:00Z"],
      files: [
        { validTime: "2026-08-23T06:00:00Z", numeric: "wind/2026-08-23T06-00Z.json" },
        { validTime: "2026-08-23T07:00:00Z", numeric: "wind/2026-08-23T07-00Z.json" },
      ],
    },
  };
}

// Real product shape (docs/PRODUCT_CONTRACT.md): 2x2 grid spanning the
// bbox exactly, row0=north/col0=west. A uniform 5 m/s eastward (u=5,v=0)
// field at 10m makes speed/direction easy to hand-verify; other heights
// null to prove per-height independence.
function numericFileFixture(u10 = 5, v10 = 0) {
  const nullGrid = [
    [null, null],
    [null, null],
  ];
  const u10Grid = [
    [u10, u10],
    [u10, u10],
  ];
  const v10Grid = [
    [v10, v10],
    [v10, v10],
  ];
  const u: Record<string, unknown> = {};
  const v: Record<string, unknown> = {};
  for (const h of MODEL_HEIGHTS_M) {
    u[String(h)] = h === 10 ? u10Grid : nullGrid;
    v[String(h)] = h === 10 ? v10Grid : nullGrid;
  }
  return {
    bbox: [8.0, 54.2, 20.0, 60.7],
    cols: 2,
    rows: 2,
    orientation: "row0=north,col0=west",
    unit: "m/s",
    heightsM: [...MODEL_HEIGHTS_M],
    coverageFrac: Object.fromEntries(MODEL_HEIGHTS_M.map((h) => [String(h), 1.0])),
    u,
    v,
  };
}

function fetchMockFor(manifest: unknown, numericFile: unknown) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/manifest.json")) {
      return { ok: true, status: 200, json: async () => manifest } as Response;
    }
    return { ok: true, status: 200, json: async () => numericFile } as Response;
  });
}

describe("assertDmiHeightsMatch", () => {
  it("does not throw when the manifest's heights exactly match MODEL_HEIGHTS_M (any order)", () => {
    expect(() =>
      assertDmiHeightsMatch([2000, 450, 10, 1750, 250, 100, 1500, 350, 50, 1250, 150, 1000, 800, 600]),
    ).not.toThrow();
  });

  it("throws rather than guessing a mapping when heights have drifted", () => {
    expect(() => assertDmiHeightsMatch([10, 50, 100, 150, 250, 350])).toThrow(/don't match/);
    expect(() =>
      assertDmiHeightsMatch([10, 50, 100, 150, 250, 350, 450, 600, 800, 1000, 1250, 1500, 1750]),
    ).toThrow(/don't match/);
  });
});

describe("fetchDmiWindManifestEntry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and returns the wind section when published", async () => {
    vi.stubGlobal("fetch", fetchMockFor(manifestWith(), numericFileFixture()));
    const wind = await fetchDmiWindManifestEntry(BASE_URL);
    expect(wind.heightsM.sort((a, b) => a - b)).toEqual([...MODEL_HEIGHTS_M]);
    expect(wind.files).toHaveLength(2);
  });

  it("throws when the manifest has no wind section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
    );
    await expect(fetchDmiWindManifestEntry(BASE_URL)).rejects.toThrow(/no wind product/);
  });

  it("throws when the manifest request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 }) as Response),
    );
    await expect(fetchDmiWindManifestEntry(BASE_URL)).rejects.toThrow(/503/);
  });

  it("throws rather than silently using a drifted-height manifest", async () => {
    vi.stubGlobal("fetch", fetchMockFor(manifestWith([10, 50, 100]), numericFileFixture()));
    await expect(fetchDmiWindManifestEntry(BASE_URL)).rejects.toThrow(/don't match/);
  });
});

describe("fetchDmiWindGrid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns an empty result without fetching for an empty point set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDmiWindGrid(BASE_URL, []);
    expect(result).toEqual({ hours: [], points: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("samples a real point inside the grid, converting u/v to speed/direction (meteorological FROM convention)", async () => {
    // u=5,v=0 at every cell -> uniform eastward flow -> wind FROM the west (270deg), speed 5.
    vi.stubGlobal("fetch", fetchMockFor(manifestWith(), numericFileFixture(5, 0)));
    const result = await fetchDmiWindGrid(BASE_URL, [{ lat: 57.0, lon: 14.0 }]);

    expect(result.hours).toEqual(["2026-08-23T06:00:00Z", "2026-08-23T07:00:00Z"]);
    expect(result.points).toHaveLength(1);
    const [p] = result.points;
    expect(p.lat).toBe(57.0);
    expect(p.lon).toBe(14.0);
    expect(p.heights[10].windSpeedMs[0]).toBeCloseTo(5, 5);
    expect(p.heights[10].windDirectionDeg[0]).toBeCloseTo(270, 5);
  });

  it("returns null series for a height whose raster is all-null at that point", async () => {
    vi.stubGlobal("fetch", fetchMockFor(manifestWith(), numericFileFixture(5, 0)));
    const result = await fetchDmiWindGrid(BASE_URL, [{ lat: 57.0, lon: 14.0 }]);
    const [p] = result.points;
    // Every height other than 10m was fixtured as all-null.
    expect(p.heights[100].windSpeedMs).toEqual([null, null]);
    expect(p.heights[450].windDirectionDeg).toEqual([null, null]);
  });

  it("returns null series for a point genuinely outside the grid's bbox", async () => {
    vi.stubGlobal("fetch", fetchMockFor(manifestWith(), numericFileFixture(5, 0)));
    const result = await fetchDmiWindGrid(BASE_URL, [{ lat: 10.0, lon: 10.0 }]); // far outside south-scandinavia
    const [p] = result.points;
    expect(p.heights[10].windSpeedMs).toEqual([null, null]);
  });

  it("fetches every published hour's file (in parallel, not sequentially blocking)", async () => {
    const fetchMock = fetchMockFor(manifestWith(), numericFileFixture());
    vi.stubGlobal("fetch", fetchMock);
    await fetchDmiWindGrid(BASE_URL, [{ lat: 57.0, lon: 14.0 }]);
    // 1 manifest request + 2 per-hour file requests (from manifestWith's 2 files).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates a per-hour file fetch failure rather than silently dropping that hour", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/manifest.json")) return { ok: true, status: 200, json: async () => manifestWith() } as Response;
      return { ok: false, status: 500 } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchDmiWindGrid(BASE_URL, [{ lat: 57.0, lon: 14.0 }])).rejects.toThrow(/500/);
  });
});

describe("mergeDmiWindIntoSiteForecast", () => {
  // The point forecast's own numbers. Deliberately distinct per height so
  // a test can tell "kept" from "coincidentally equal".
  const POINT_SPEED = 5.3;
  const POINT_DIR = 312;
  const POINT_GUST = 8.1;
  // What the coarse regional raster says at the same place and time -
  // clearly different, in both speed and bearing, from the point forecast.
  const RASTER_SPEED = 2.7;
  const RASTER_DIR = 200;

  function baseForecast(hours: string[]): SiteForecast {
    return {
      siteId: "hovs-hallar-nv",
      sourceId: "open-meteo",
      hours,
      heights: Object.fromEntries(
        MODEL_HEIGHTS_M.map((h) => [
          h,
          {
            // Open-Meteo answers at 10 m and 100 m and null-fills the rest,
            // which is what makes the raster necessary above 100 m.
            windDirectionDeg: hours.map(() => (h === 10 || h === 100 ? POINT_DIR : null)),
            windSpeedMs: hours.map(() => (h === 10 || h === 100 ? POINT_SPEED : null)),
          },
        ]),
      ) as SiteForecast["heights"],
      windGustMs: hours.map(() => POINT_GUST),
      weatherKind: hours.map(() => "clear"),
    };
  }

  function dmiPoint(dmiHours: string[], speed = RASTER_SPEED, dir = RASTER_DIR): WindGridPoint {
    return {
      lat: 56.4,
      lon: 12.6,
      heights: Object.fromEntries(
        MODEL_HEIGHTS_M.map((h) => [h, { windDirectionDeg: dmiHours.map(() => dir), windSpeedMs: dmiHours.map(() => speed) }]),
      ) as WindGridPoint["heights"],
    };
  }

  it("keeps hours/weatherKind/windGustMs untouched - only heights change", () => {
    const hours = ["2026-08-23T07:00:00Z", "2026-08-23T08:00:00Z"];
    const forecast = baseForecast(hours);
    const merged = mergeDmiWindIntoSiteForecast(forecast, dmiPoint(hours), hours);
    expect(merged.hours).toBe(forecast.hours);
    expect(merged.weatherKind).toBe(forecast.weatherKind);
    expect(merged.windGustMs).toBe(forecast.windGustMs);
  });

  /**
   * The regression test for docs/FORECAST_INTEGRITY.md.
   *
   * A coarse regional sample of 2.7 m/s from a different bearing must not
   * be able to displace a 5.3 m/s point forecast at the height that
   * decides whether a site shows green. Before this was fixed it did
   * exactly that, on every site, silently.
   */
  it("never lets the raster displace the point forecast at 10 m or 100 m", () => {
    const hours = ["2026-08-23T07:00:00Z", "2026-08-23T08:00:00Z"];
    const forecast = baseForecast(hours);
    const merged = mergeDmiWindIntoSiteForecast(forecast, dmiPoint(hours, RASTER_SPEED, RASTER_DIR), hours);

    for (const h of [10, 100] as const) {
      expect(merged.heights[h].windSpeedMs).toEqual([POINT_SPEED, POINT_SPEED]);
      expect(merged.heights[h].windDirectionDeg).toEqual([POINT_DIR, POINT_DIR]);
      expect(merged.heights[h].windSpeedMs).not.toContain(RASTER_SPEED);
      expect(merged.heights[h].windDirectionDeg).not.toContain(RASTER_DIR);
    }
    // The gust travels with the surface wind it belongs to.
    expect(merged.windGustMs).toEqual([POINT_GUST, POINT_GUST]);
  });

  it("fills the heights the point forecast cannot answer from the raster", () => {
    const hours = ["2026-08-23T07:00:00Z", "2026-08-23T08:00:00Z"];
    const merged = mergeDmiWindIntoSiteForecast(baseForecast(hours), dmiPoint(hours), hours);
    for (const h of MODEL_HEIGHTS_M.filter((x) => x !== 10 && x !== 100)) {
      expect(merged.heights[h].windSpeedMs).toEqual([RASTER_SPEED, RASTER_SPEED]);
      expect(merged.heights[h].windDirectionDeg).toEqual([RASTER_DIR, RASTER_DIR]);
    }
  });

  it("leaves upper heights null beyond the raster's horizon while the surface stays complete", () => {
    // The raster's horizon is shorter than the point forecast's. This used
    // to blank the surface too, deleting half of every site's forecast.
    const forecastHours = ["2026-08-23T07:00:00Z", "2026-08-25T20:00:00Z"];
    const dmiHours = ["2026-08-23T07:00:00Z"];
    const merged = mergeDmiWindIntoSiteForecast(baseForecast(forecastHours), dmiPoint(dmiHours), dmiHours);

    expect(merged.heights[150].windSpeedMs[0]).toBe(RASTER_SPEED);
    expect(merged.heights[150].windSpeedMs[1]).toBeNull();
    expect(merged.heights[150].windDirectionDeg[1]).toBeNull();

    expect(merged.heights[10].windSpeedMs).toEqual([POINT_SPEED, POINT_SPEED]);
    expect(merged.heights[10].windSpeedMs).not.toContain(null);
  });

  it("matches within the tolerance window despite a small real timestamp offset", () => {
    const forecastHours = ["2026-08-23T07:00:00Z"];
    const dmiHours = ["2026-08-23T07:10:00Z"]; // 10 minutes off - within WIND_TIME_TOLERANCE_MINUTES
    const merged = mergeDmiWindIntoSiteForecast(baseForecast(forecastHours), dmiPoint(dmiHours, 9, 100), dmiHours);
    expect(merged.heights[150].windSpeedMs[0]).toBe(9);
  });

  it("does not match an hour far outside the tolerance window", () => {
    const forecastHours = ["2026-08-23T07:00:00Z"];
    const dmiHours = ["2026-08-23T09:00:00Z"]; // 2 hours off - outside tolerance
    const merged = mergeDmiWindIntoSiteForecast(baseForecast(forecastHours), dmiPoint(dmiHours, 9, 100), dmiHours);
    expect(merged.heights[150].windSpeedMs[0]).toBeNull();
    // ...and the surface is still the point forecast's own, not a null.
    expect(merged.heights[10].windSpeedMs[0]).toBe(POINT_SPEED);
  });
});
