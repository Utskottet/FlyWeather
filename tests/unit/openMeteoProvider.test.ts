import { describe, expect, it } from "vitest";
import {
  buildOpenMeteoBatchUrl,
  buildOpenMeteoUrl,
  normalizeOpenMeteoResponse,
  type OpenMeteoResponse,
} from "../../src/providers/forecast/openMeteoProvider.ts";

describe("buildOpenMeteoUrl", () => {
  it("requests m/s wind speed, UTC timestamps, 5 forecast days, and every model height", () => {
    const url = buildOpenMeteoUrl(55.4, 14.0);
    expect(url).toContain("latitude=55.4");
    expect(url).toContain("longitude=14");
    expect(url).toContain("wind_speed_unit=ms");
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("forecast_days=5");
    expect(url).toContain("wind_direction_10m");
    expect(url).toContain("wind_speed_80m");
    expect(url).toContain("wind_direction_120m");
    expect(url).toContain("wind_speed_180m");
    expect(url).toContain("weather_code");
  });
});

describe("buildOpenMeteoBatchUrl (Block 13 - one request for every site)", () => {
  it("comma-joins every site's coordinates in request order, with full hourly variables", () => {
    const url = buildOpenMeteoBatchUrl([
      { lat: 55.4, lon: 14.0 },
      { lat: 55.9, lon: 12.7 },
    ]);
    const params = new URL(url).searchParams;
    expect(params.get("latitude")).toBe("55.400000,55.900000");
    expect(params.get("longitude")).toBe("14.000000,12.700000");
    expect(params.get("hourly")).toContain("wind_speed_180m");
    expect(params.get("forecast_days")).toBe("5");
  });
});

describe("normalizeOpenMeteoResponse", () => {
  const fixture: OpenMeteoResponse = {
    hourly: {
      time: ["2026-08-18T00:00", "2026-08-18T01:00", "2026-08-18T02:00"],
      wind_speed_10m: [3.4, 4.8, null],
      wind_direction_10m: [268, 230, null],
      wind_speed_80m: [8.0, 7.5, null],
      wind_direction_80m: [303, 300, null],
      wind_speed_120m: [8.4, 7.9, null],
      wind_direction_120m: [303, 301, null],
      wind_speed_180m: [10.3, 9.8, null],
      wind_direction_180m: [306, 302, null],
      wind_gusts_10m: [7.1, 6.5, null],
      weather_code: [0, 61, 9999],
    },
  };

  it("maps every hourly field into the SiteForecast shape, aligned by index", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.siteId).toBe("hammar");
    expect(forecast.sourceId).toBe("open-meteo");
    expect(forecast.hours).toEqual(fixture.hourly.time);
    expect(forecast.windGustMs).toEqual([7.1, 6.5, null]);
  });

  it("maps each discrete model height into its own series", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.heights[10].windSpeedMs).toEqual([3.4, 4.8, null]);
    expect(forecast.heights[10].windDirectionDeg).toEqual([268, 230, null]);
    expect(forecast.heights[80].windSpeedMs).toEqual([8.0, 7.5, null]);
    expect(forecast.heights[120].windDirectionDeg).toEqual([303, 301, null]);
    expect(forecast.heights[180].windSpeedMs).toEqual([10.3, 9.8, null]);
  });

  it("maps weather codes through the internal WeatherKind enum, including unknown", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.weatherKind).toEqual(["clear", "rain", "unknown"]);
  });
});
