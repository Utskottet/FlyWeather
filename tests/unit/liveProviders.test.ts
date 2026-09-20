import { describe, expect, it } from "vitest";
import { parseSmhi, parseSmhiStationId } from "../../src/providers/live/smhiProvider.ts";
import { parseMetar } from "../../src/providers/live/metarProvider.ts";
import { parseBelchertown, parseSpeedWithUnit } from "../../src/providers/live/weewxProvider.ts";
import { parseVivaResponse } from "../../src/providers/live/vivaProvider.ts";
import { numeric, stockholmTimestamp, validGust, validWind } from "../../src/providers/live/parse.ts";
import { isAllowedSourceUrl, ALLOWED_SOURCE_HOSTS } from "../../src/providers/live/sourceUrl.ts";
import { canonicalProvider, isKnownProvider, resolveLiveSample } from "../../src/providers/live/resolver.ts";
import type { LiveWindProvider } from "../../src/providers/live/types.ts";
import type { WindSample } from "../../src/domain/types.ts";

/**
 * The rules that keep a live reading honest: measurement time is not
 * download time, a missing gust is missing, and a wind nobody could
 * measure is refused rather than displayed.
 */

describe("source allowlist", () => {
  it("accepts the sources we have actually written readers for", () => {
    expect(isAllowedSourceUrl("https://vader.sjoboflyg.se/json/weewx_data.json")).toBe(true);
    expect(isAllowedSourceUrl("https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/47.json")).toBe(true);
  });

  it("refuses anything else, however plausible", () => {
    // A station record is contributor-supplied and is fetched by the
    // collector and the Worker. Without this, a public form is a proxy.
    expect(isAllowedSourceUrl("https://evil.example/feed.json")).toBe(false);
    expect(isAllowedSourceUrl("http://vader.sjoboflyg.se/json/weewx_data.json")).toBe(false);
    expect(isAllowedSourceUrl("https://vader.sjoboflyg.se.evil.example/x.json")).toBe(false);
    expect(isAllowedSourceUrl("not a url")).toBe(false);
  });

  it("refuses credentials and explicit ports - both redirect an allowlisted name elsewhere", () => {
    expect(isAllowedSourceUrl("https://user:pw@vader.sjoboflyg.se/json/weewx_data.json")).toBe(false);
    expect(isAllowedSourceUrl("https://vader.sjoboflyg.se:8080/json/weewx_data.json")).toBe(false);
  });

  it("keeps the list short enough that somebody has looked at every entry", () => {
    expect(ALLOWED_SOURCE_HOSTS.length).toBeLessThan(20);
  });
});

describe("shared parsing", () => {
  it("reads the Swedish decimal comma, and refuses text that merely contains digits", () => {
    expect(numeric("4,5")).toBe(4.5);
    expect(numeric("4.5")).toBe(4.5);
    expect(numeric("V 3.2")).toBeNull();
    expect(numeric("")).toBeNull();
    expect(numeric(Number.NaN)).toBeNull();
  });

  it("refuses a wind no sensor could have measured", () => {
    expect(validWind(5, 180)).toBe(true);
    expect(validWind(5, 360)).toBe(true);
    expect(validWind(-1, 180)).toBe(false);
    expect(validWind(900, 180)).toBe(false);
    expect(validWind(5, 400)).toBe(false);
    expect(validWind(null, 180)).toBe(false);
  });

  it("passes a missing gust through as missing rather than zero", () => {
    expect(validGust(null)).toBeNull();
    expect(validGust(0)).toBe(0);
    expect(validGust(999)).toBeNull();
  });

  it("resolves Swedish wall-clock time to a real instant", () => {
    // Midsummer: Stockholm is UTC+2.
    expect(stockholmTimestamp("2026-06-21 14:30:00")).toBe("2026-06-21T12:30:00.000Z");
    // Midwinter: UTC+1.
    expect(stockholmTimestamp("2026-01-15 14:30:00")).toBe("2026-01-15T13:30:00.000Z");
  });

  it("refuses the repeated hour when clocks go back, rather than guessing", () => {
    // 02:30 on the last Sunday of October happens twice. Guessing puts
    // the reading an hour out - on the wrong side of every freshness
    // threshold.
    expect(stockholmTimestamp("2026-10-25 02:30:00")).toBeNull();
    expect(stockholmTimestamp("not a time")).toBeNull();
    expect(stockholmTimestamp(undefined)).toBeNull();
  });
});

describe("SMHI", () => {
  const wind = (date: number, value: string, quality = "G") => ({ date, value, quality });

  it("pairs speed with the direction from the SAME instant", () => {
    const parsed = parseSmhi(
      { value: [wind(1_000_000, "5.0"), wind(1_060_000, "6.0")] },
      { value: [wind(1_000_000, "180"), wind(1_060_000, "200")] },
      { intervalMinutes: 1 },
    );
    expect(parsed.windSpeedMs).toBe(6);
    expect(parsed.windDirectionDeg).toBe(200);
    expect(parsed.timestamp).toBe(new Date(1_060_000).toISOString());
  });

  it("refuses to combine a speed and a direction from different minutes", () => {
    // One reading out of step is not one observation; combining them
    // invents a wind that was never measured.
    expect(() =>
      parseSmhi({ value: [wind(1_060_000, "6.0")] }, { value: [wind(1_000_000, "180")] }, { intervalMinutes: 1 }),
    ).toThrow();
  });

  it("keeps the hourly gust as a separate report with its own time", () => {
    // Real shape, observed live: wind at 09:12, gust maximum stamped
    // 08:00. Presenting that as "the gust right now" is a confident lie.
    const parsed = parseSmhi(
      { value: [wind(1_060_000, "6.0")] },
      { value: [wind(1_060_000, "200")] },
      { intervalMinutes: 1 },
      { value: [wind(1_000_000, "9.2")] },
    );
    expect(parsed.windGustMs).toBeNull();
    expect(parsed.gustReport).toMatchObject({ windGustMs: 9.2, timestamp: new Date(1_000_000).toISOString() });
    expect(parsed.gustReport?.label).toMatch(/separate/i);
  });

  it("never attaches a gust recorded after the wind reading", () => {
    const parsed = parseSmhi(
      { value: [wind(1_000_000, "6.0")] },
      { value: [wind(1_000_000, "200")] },
      { intervalMinutes: 1 },
      { value: [wind(9_000_000, "20")] },
    );
    expect(parsed.gustReport).toBeNull();
  });

  it("judges freshness against what the station actually promises", () => {
    const oneMinute = parseSmhi({ value: [wind(1e6, "5")] }, { value: [wind(1e6, "180")] }, { intervalMinutes: 1 });
    const hourly = parseSmhi({ value: [wind(1e6, "5")] }, { value: [wind(1e6, "180")] }, { intervalMinutes: 60 });
    // An hourly ten-minute mean being 50 minutes old is normal, not a fault.
    expect(oneMinute.staleAfterMinutes).toBeLessThan(hourly.staleAfterMinutes!);
  });

  it("marks a flagged reading suspect rather than dropping or trusting it", () => {
    const parsed = parseSmhi(
      { value: [wind(1e6, "5", "Y")] },
      { value: [wind(1e6, "180", "G")] },
      { intervalMinutes: 1 },
    );
    expect(parsed.quality).toBe("suspect");
  });

  it("carries which product a station publishes in its id", () => {
    expect(parseSmhiStationId("53530")).toEqual({ id: "53530", intervalMinutes: 1 });
    expect(parseSmhiStationId("63160@60")).toEqual({ id: "63160", intervalMinutes: 60 });
    expect(() => parseSmhiStationId("../etc/passwd")).toThrow();
  });
});

describe("METAR", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    icaoId: "ESMS",
    obsTime: 1_800_000_000,
    wspd: 11,
    wdir: 230,
    ...over,
  });

  it("converts knots to m/s", () => {
    // 11 kt is 5.66 m/s. Reading it as m/s would double it.
    expect(parseMetar(row()).windSpeedMs).toBeCloseTo(5.66, 2);
  });

  it("keeps a variable wind variable instead of pointing it north", () => {
    const parsed = parseMetar(row({ wdir: "VRB" }));
    expect(parsed.windDirectionDeg).toBeNull();
    expect(parsed.variableDirection).toBe(true);
  });

  it("keeps a missing gust missing", () => {
    expect(parseMetar(row()).windGustMs).toBeNull();
    expect(parseMetar(row({ wgst: 20 })).windGustMs).toBeCloseTo(10.29, 2);
  });

  it("uses the observation time, never the download time", () => {
    expect(parseMetar(row()).timestamp).toBe(new Date(1_800_000_000_000).toISOString());
  });

  it("refuses a report with no observation time - an airport reading of unknown age is worth little", () => {
    expect(() => parseMetar(row({ obsTime: undefined }))).toThrow();
  });

  it("refuses nonsense rather than publishing it", () => {
    expect(() => parseMetar(row({ wspd: null }))).toThrow();
    expect(() => parseMetar(row({ wdir: 999 }))).toThrow();
    expect(() => parseMetar(undefined)).toThrow();
  });

  it("allows an hour and a half before calling an airport report stale", () => {
    expect(parseMetar(row()).staleAfterMinutes).toBe(90);
  });
});

describe("club WeeWX stations", () => {
  const feed = (over: Record<string, unknown> = {}) => ({
    current: { windspeed: "2.6 m/s", winddir_formatted: "253", windGust: "4.1 m/s", datetime_raw: 1_800_000_000, ...over },
  });

  it("reads the unit the club configured rather than assuming m/s", () => {
    // A station set to knots read as m/s is out by a factor of two -
    // the difference between a green rose and a red one.
    expect(parseSpeedWithUnit("8 knop")).toBeCloseTo(4.12, 2);
    expect(parseSpeedWithUnit("14,5 km/h")).toBeCloseTo(4.03, 2);
    expect(parseSpeedWithUnit("10 mph")).toBeCloseTo(4.47, 2);
    expect(parseSpeedWithUnit("4.2 m/s")).toBe(4.2);
  });

  it("treats an unrecognised unit as unknown data, not as m/s", () => {
    expect(parseSpeedWithUnit("5 furlongs/fortnight")).toBeNull();
    expect(parseSpeedWithUnit("5")).toBeNull();
    expect(parseSpeedWithUnit("")).toBeNull();
  });

  it("uses the station's archive time, not the moment we asked", () => {
    // A club station that has stopped updating serves its last record
    // forever; only this timestamp reveals that.
    expect(parseBelchertown(feed()).timestamp).toBe(new Date(1_800_000_000_000).toISOString());
  });

  it("refuses a reading with no measurement time", () => {
    expect(() => parseBelchertown(feed({ datetime_raw: undefined }))).toThrow();
    expect(() => parseBelchertown(feed({ datetime_raw: 0 }))).toThrow();
  });

  it("keeps a missing gust missing", () => {
    expect(parseBelchertown(feed({ windGust: undefined })).windGustMs).toBeNull();
  });

  it("refuses a feed with no usable wind", () => {
    expect(() => parseBelchertown({ current: {} })).toThrow();
    expect(() => parseBelchertown(feed({ winddir_formatted: "999" }))).toThrow();
  });
});

describe("ViVa", () => {
  const sample = (name: string, value: string, updated: string, over: Record<string, unknown> = {}) => ({
    Name: name,
    Value: value,
    Heading: 0,
    Unit: "m/s",
    Type: "x",
    Quality: "Ok",
    Updated: updated,
    ...over,
  });
  const at = "2026-06-21 14:30:00";

  it("publishes the measurement time ViVa gives, not the download time", () => {
    const parsed = parseVivaResponse({
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "Barsebäck",
        Samples: [sample("Medelvind", "V 8.2", at), sample("Vindriktning", "245.1", at, { Unit: "grader" })],
      },
    });
    expect(parsed?.observedAt).toBe("2026-06-21T12:30:00.000Z");
    expect(parsed?.windSpeedMs).toBe(8.2);
    expect(parsed?.windDirectionDeg).toBeCloseTo(245.1, 1);
  });

  it("still reports the wind when the station has no gust", () => {
    // This was the bug: gust was required, so a station that simply does
    // not report gusts produced no live wind at all. Missing gust means
    // unknown gust, not unknown wind.
    const parsed = parseVivaResponse({
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "x",
        Samples: [sample("Medelvind", "V 8.2", at), sample("Vindriktning", "245.1", at, { Unit: "grader" })],
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.windGustMs).toBeNull();
  });

  it("ignores a gust measured at a different time from the mean", () => {
    const parsed = parseVivaResponse({
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "x",
        Samples: [
          sample("Medelvind", "V 8.2", at),
          sample("Vindriktning", "245.1", at, { Unit: "grader" }),
          sample("Byvind", "V 9.6", "2026-06-21 14:25:00"),
        ],
      },
    });
    expect(parsed?.windGustMs).toBeNull();
  });

  it("reports an unknown age rather than a guessed one when speed and direction disagree", () => {
    const parsed = parseVivaResponse({
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "x",
        Samples: [
          sample("Medelvind", "V 8.2", at),
          sample("Vindriktning", "245.1", "2026-06-21 14:25:00", { Unit: "grader" }),
        ],
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.observedAt).toBeNull();
  });

  it("refuses a flagged reading", () => {
    const parsed = parseVivaResponse({
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "x",
        Samples: [
          sample("Medelvind", "V 8.2", at, { Quality: "Bad" }),
          sample("Vindriktning", "245.1", at, { Unit: "grader" }),
        ],
      },
    });
    expect(parsed).toBeNull();
  });
});

describe("provider resolution", () => {
  it("maps older and third-party spellings onto the reader that serves them", () => {
    // Klamby's file has said "sjoboflyg" since before any reader existed.
    // Aliasing means no site file has to be rewritten to start working.
    expect(canonicalProvider("sjoboflyg")).toBe("weewx");
    expect(canonicalProvider("local")).toBe("weewx");
    expect(canonicalProvider("HOLFUY")).toBe("holfuy");
    expect(canonicalProvider("smhi")).toBe("smhi");
  });

  it("knows which providers can actually be read", () => {
    expect(isKnownProvider("sjoboflyg")).toBe(true);
    expect(isKnownProvider("metar")).toBe(true);
    // A station id typed into the provider field - a real site had this.
    expect(isKnownProvider("33")).toBe(false);
    expect(isKnownProvider("windy")).toBe(false);
  });

  it("skips a provider nothing can read instead of failing the site", async () => {
    const sample = await resolveLiveSample([{ provider: "windy", station_id: "1", priority: 1, verified: false }], {});
    expect(sample).toBeNull();
  });

  it("falls through to the next source when one throws", async () => {
    const broken: LiveWindProvider = {
      fetch: async () => {
        throw new Error("upstream down");
      },
    };
    const working: LiveWindProvider = {
      fetch: async (): Promise<WindSample[]> => [
        {
          sourceId: "weewx",
          sourceKind: "observation",
          timestamp: "2026-06-21T12:30:00.000Z",
          windDirectionDeg: 180,
          windSpeedMs: 5,
          windGustMs: null,
        },
      ],
    };
    const sample = await resolveLiveSample(
      [
        { provider: "holfuy", station_id: "1", priority: 1, verified: false },
        { provider: "weewx", station_id: "2", priority: 2, verified: false },
      ],
      { holfuy: broken, weewx: working },
    );
    expect(sample?.sourceId).toBe("weewx");
  });

  it("resolves an aliased provider through the registry too", async () => {
    const working: LiveWindProvider = {
      fetch: async (source): Promise<WindSample[]> => [
        {
          sourceId: "weewx",
          sourceKind: "observation",
          stationId: source.station_id ?? undefined,
          timestamp: "2026-06-21T12:30:00.000Z",
          windDirectionDeg: 180,
          windSpeedMs: 5,
          windGustMs: null,
        },
      ],
    };
    const sample = await resolveLiveSample(
      [{ provider: "sjoboflyg", station_id: "esmi", priority: 1, verified: false }],
      { weewx: working },
    );
    expect(sample?.stationId).toBe("esmi");
  });
});
