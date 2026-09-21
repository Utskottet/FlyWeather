import { describe, expect, it } from "vitest";
import { forecastHourMs, normaliseForecastHour, parseForecastHour } from "../../src/domain/forecastTime.ts";
import { findNowIndex, nowPositionFraction } from "../../src/domain/timeAxis.ts";

/**
 * The bug these guard against, in one line:
 *
 *   new Date("2026-09-22T17:00")  ->  15:00Z on a Swedish machine
 *
 * Open-Meteo answers with that bare form for a timezone=UTC request, so
 * every naive parse read each forecast row two hours early in summer.
 * The slider label and the row name stayed consistent with each other,
 * which is why nobody saw it: the app said 17:00 and showed the wind for
 * 19:00. See docs/FORECAST_INTEGRITY.md.
 *
 * These tests only mean anything in a zone that is not UTC, because on a
 * UTC machine the naive parse accidentally gives the right answer. So
 * tests/unit-setup.ts pins every run to Europe/Stockholm - verified by
 * reintroducing the bug with TZ=UTC and watching these fail anyway.
 */
describe("parseForecastHour", () => {
  it("reads a bare Open-Meteo timestamp as UTC, not as local time", () => {
    expect(parseForecastHour("2026-09-22T17:00").toISOString()).toBe("2026-09-22T17:00:00.000Z");
  });

  it("respects a timestamp that already carries its own zone", () => {
    // The regional wind grid publishes this form, which is why the two
    // sources have to be reconciled before they can be matched at all.
    expect(parseForecastHour("2026-09-21T15:00:00Z").toISOString()).toBe("2026-09-21T15:00:00.000Z");
    expect(parseForecastHour("2026-09-21T17:00:00+02:00").toISOString()).toBe("2026-09-21T15:00:00.000Z");
  });

  it("agrees with itself across both published formats for the same instant", () => {
    expect(forecastHourMs("2026-09-22T17:00")).toBe(forecastHourMs("2026-09-22T17:00:00Z"));
  });

  it("returns an invalid date rather than throwing on nonsense", () => {
    expect(Number.isNaN(parseForecastHour("not a time").getTime())).toBe(true);
  });
});

describe("normaliseForecastHour", () => {
  it("stamps a bare timestamp so nothing downstream has to infer", () => {
    expect(normaliseForecastHour("2026-09-22T17:00")).toBe("2026-09-22T17:00Z");
  });

  it("leaves an already-zoned timestamp exactly as it is", () => {
    expect(normaliseForecastHour("2026-09-21T15:00:00Z")).toBe("2026-09-21T15:00:00Z");
    expect(normaliseForecastHour("2026-09-21T17:00:00+02:00")).toBe("2026-09-21T17:00:00+02:00");
  });
});

describe("the time axis reads hours as UTC", () => {
  const hours = ["2026-09-22T12:00", "2026-09-22T13:00", "2026-09-22T14:00", "2026-09-22T15:00"];

  it("picks the row that is actually current, not one two hours away", () => {
    // 13:30 UTC - the next row at or after it is 14:00 UTC, index 2.
    expect(findNowIndex(hours, new Date("2026-09-22T13:30:00Z"))).toBe(2);
  });

  it("places NOW at the real position along the track", () => {
    // Exactly one hour into a three-hour span.
    expect(nowPositionFraction(hours, new Date("2026-09-22T13:00:00Z"))).toBeCloseTo(1 / 3, 6);
  });

  it("treats the zoned and bare spellings of the same hours identically", () => {
    const zoned = hours.map((h) => `${h}:00Z`);
    const now = new Date("2026-09-22T13:30:00Z");
    expect(findNowIndex(zoned, now)).toBe(findNowIndex(hours, now));
    expect(nowPositionFraction(zoned, now)).toBe(nowPositionFraction(hours, now));
  });
});
