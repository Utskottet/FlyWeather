import { describe, expect, it } from "vitest";
import { buildVivaUrl, parseVivaResponse } from "../../src/providers/live/vivaProvider.ts";

// Real response captured from https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/ViVaStationWithDirection/25?isMVY=false
// (station 25 = Barsebäck) via a live browser network capture against the
// station page - see docs/DATA_SOURCE_AUDIT.md.
const REAL_FIXTURE = {
  GetSingleStationWithDirectionsAsParametersResult: {
    ID: 25,
    Name: "Barsebäck",
    Samples: [
      {
        Name: "Vattenstånd",
        Value: "23",
        Heading: 0,
        Unit: "cm",
        Type: "level",
        Quality: "Ok",
      },
      {
        Name: "Byvind",
        Value: "V 3.2",
        Heading: 248,
        Unit: "m/s",
        Type: "wind",
        Quality: "Ok",
      },
      {
        Name: "Medelvind",
        Value: "V 2.1",
        Heading: 248,
        Unit: "m/s",
        Type: "wind",
        Quality: "Ok",
      },
      {
        Name: "Vindriktning",
        Value: "248.1",
        Heading: 0,
        Unit: "°",
        Type: "heading",
        Quality: "Ok",
      },
    ],
  },
};

describe("buildVivaUrl", () => {
  it("uses the public services.viva.sjofartsverket.se JSON endpoint", () => {
    const url = buildVivaUrl("25");
    expect(url).toBe(
      "https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/ViVaStationWithDirection/25?isMVY=false",
    );
  });
});

describe("parseVivaResponse", () => {
  it("maps Medelvind/Byvind/Vindriktning to sustained speed, gust, and direction", () => {
    const parsed = parseVivaResponse(REAL_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed?.windSpeedMs).toBe(2.1);
    expect(parsed?.windGustMs).toBe(3.2);
    expect(parsed?.windDirectionDeg).toBe(248.1);
    expect(parsed!.windGustMs).toBeGreaterThan(parsed!.windSpeedMs); // gust >= sustained, sanity check
  });

  it("strips the compass-letter prefix from speed/gust values", () => {
    const parsed = parseVivaResponse(REAL_FIXTURE);
    expect(parsed?.windSpeedMs).not.toBeNaN();
    expect(Number.isInteger(parsed?.windSpeedMs)).toBe(false); // 2.1, not mangled by the "V " prefix
  });

  it("returns null when the result envelope is missing", () => {
    expect(parseVivaResponse({})).toBeNull();
    expect(parseVivaResponse(null)).toBeNull();
  });

  it("returns null when a required sample (Medelvind/Byvind/Vindriktning) is missing", () => {
    const incomplete = {
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "Barsebäck",
        Samples: [REAL_FIXTURE.GetSingleStationWithDirectionsAsParametersResult.Samples[1]], // only Byvind
      },
    };
    expect(parseVivaResponse(incomplete)).toBeNull();
  });

  it("returns null when a sample's Quality is not \"Ok\" (never serve a flagged reading silently)", () => {
    const flagged = {
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "Barsebäck",
        Samples: REAL_FIXTURE.GetSingleStationWithDirectionsAsParametersResult.Samples.map((s) =>
          s.Name === "Medelvind" ? { ...s, Quality: "Off" } : s,
        ),
      },
    };
    expect(parseVivaResponse(flagged)).toBeNull();
  });

  it("returns null on malformed numeric data rather than NaN", () => {
    const malformed = {
      GetSingleStationWithDirectionsAsParametersResult: {
        ID: 25,
        Name: "Barsebäck",
        Samples: REAL_FIXTURE.GetSingleStationWithDirectionsAsParametersResult.Samples.map((s) =>
          s.Name === "Vindriktning" ? { ...s, Value: "north-ish" } : s,
        ),
      },
    };
    expect(parseVivaResponse(malformed)).toBeNull();
  });
});
