import { describe, expect, it } from "vitest";
import { openMeteoCodeToWeatherKind } from "../../src/domain/weather.ts";

describe("openMeteoCodeToWeatherKind", () => {
  it("maps known WMO codes", () => {
    expect(openMeteoCodeToWeatherKind(0)).toBe("clear");
    expect(openMeteoCodeToWeatherKind(1)).toBe("partly-cloudy");
    expect(openMeteoCodeToWeatherKind(3)).toBe("cloudy");
    expect(openMeteoCodeToWeatherKind(45)).toBe("fog");
    expect(openMeteoCodeToWeatherKind(53)).toBe("drizzle");
    expect(openMeteoCodeToWeatherKind(63)).toBe("rain");
    expect(openMeteoCodeToWeatherKind(81)).toBe("showers");
    expect(openMeteoCodeToWeatherKind(75)).toBe("snow");
    expect(openMeteoCodeToWeatherKind(95)).toBe("thunder");
  });

  it("returns unknown for null, undefined, or unrecognized codes", () => {
    expect(openMeteoCodeToWeatherKind(null)).toBe("unknown");
    expect(openMeteoCodeToWeatherKind(undefined)).toBe("unknown");
    expect(openMeteoCodeToWeatherKind(9999)).toBe("unknown");
  });
});
