import { describe, expect, it } from "vitest";
import {
  buildOpenMeteoUrl,
  normalizeOpenMeteoResponse,
  type OpenMeteoResponse,
} from "../../src/providers/forecast/openMeteoProvider.ts";

describe("buildOpenMeteoUrl", () => {
  it("requests m/s wind speed, UTC timestamps, and 5 forecast days", () => {
    const url = buildOpenMeteoUrl(55.4, 14.0);
    expect(url).toContain("latitude=55.4");
    expect(url).toContain("longitude=14");
    expect(url).toContain("wind_speed_unit=ms");
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("forecast_days=5");
    expect(url).toContain("wind_direction_10m");
    expect(url).toContain("weather_code");
  });
});

describe("normalizeOpenMeteoResponse", () => {
  const fixture: OpenMeteoResponse = {
    hourly: {
      time: ["2026-08-18T00:00", "2026-08-18T01:00", "2026-08-18T02:00"],
      wind_speed_10m: [5.2, 4.8, null],
      wind_direction_10m: [225, 230, null],
      wind_gusts_10m: [7.1, 6.5, null],
      weather_code: [0, 61, 9999],
    },
  };

  it("maps every hourly field into the SiteForecast shape, aligned by index", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.siteId).toBe("hammar");
    expect(forecast.sourceId).toBe("open-meteo");
    expect(forecast.hours).toEqual(fixture.hourly.time);
    expect(forecast.windSpeedMs).toEqual([5.2, 4.8, null]);
    expect(forecast.windDirectionDeg).toEqual([225, 230, null]);
    expect(forecast.windGustMs).toEqual([7.1, 6.5, null]);
  });

  it("maps weather codes through the internal WeatherKind enum, including unknown", () => {
    const forecast = normalizeOpenMeteoResponse("hammar", fixture);
    expect(forecast.weatherKind).toEqual(["clear", "rain", "unknown"]);
  });
});
