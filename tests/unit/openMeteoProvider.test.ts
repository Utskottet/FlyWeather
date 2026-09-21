import { describe, expect, it } from "vitest";
import {
  buildOpenMeteoBatchUrl,
  buildOpenMeteoUrl,
  normalizeOpenMeteoResponse,
  type OpenMeteoResponse,
} from "../../src/providers/forecast/openMeteoProvider.ts";

describe("buildOpenMeteoUrl", () => {
  it("requests m/s wind speed, UTC timestamps, 5 forecast days, and every model height (§ Simplify DMI Wind v1 - Open-Meteo is the fallback, requested at DMI's own heights)", () => {
    const url = buildOpenMeteoUrl(55.4, 14.0);
    expect(url).toContain("latitude=55.4");
    expect(url).toContain("longitude=14");
    expect(url).toContain("wind_speed_unit=ms");
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("forecast_days=5");
    expect(url).toContain("wind_direction_10m");
    expect(url).toContain("wind_speed_100m");
    expect(url).toContain("wind_direction_250m");
    expect(url).toContain("wind_speed_450m");
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
    expect(params.get("hourly")).toContain("wind_speed_450m");
    expect(params.get("forecast_days")).toBe("5");
  });
});

describe("normalizeOpenMeteoResponse", () => {
  const fixture: OpenMeteoResponse = {
    hourly: {
      time: ["2026-08-18T00:00", "2026-08-18T01:00", "2026-08-18T02:00"],
      wind_speed_10m: [3.4, 4.8, null],
      wind_direction_10m: [268, 230, null],
      wind_speed_100m: [8.0, 7.5, null],
      wind_direction_100m: [303, 300, null],
      wind_speed_450m: [10.3, 9.8, null],
      wind_direction_450m: [306, 302, null],
      wind_gusts_10m: [7.1, 6.5, null],
      weather_code: [0, 61, 9999],
    },
  };

  it("maps every hourly field into the SiteForecast shape, aligned by index", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.siteId).toBe("hammar");
    expect(forecast.sourceId).toBe("open-meteo");
    // Open-Meteo answers timezone=UTC without saying so; the provider
    // stamps the zone on so nothing downstream has to infer it.
    expect(forecast.hours).toEqual(fixture.hourly.time.map((t) => `${t}Z`));
    expect(forecast.windGustMs).toEqual([7.1, 6.5, null]);
  });

  it("maps each discrete model height into its own series", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.heights[10].windSpeedMs).toEqual([3.4, 4.8, null]);
    expect(forecast.heights[10].windDirectionDeg).toEqual([268, 230, null]);
    expect(forecast.heights[100].windSpeedMs).toEqual([8.0, 7.5, null]);
    expect(forecast.heights[450].windDirectionDeg).toEqual([306, 302, null]);
    expect(forecast.heights[450].windSpeedMs).toEqual([10.3, 9.8, null]);
  });

  it("null-fills heights Open-Meteo doesn't support (50/150/250/350m) rather than crashing", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    for (const h of [50, 150, 250, 350] as const) {
      expect(forecast.heights[h].windSpeedMs).toEqual([null, null, null]);
      expect(forecast.heights[h].windDirectionDeg).toEqual([null, null, null]);
    }
  });

  it("maps weather codes through the internal WeatherKind enum, including unknown", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.weatherKind).toEqual(["clear", "rain", "unknown"]);
  });
});
