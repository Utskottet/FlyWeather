import { describe, expect, it } from "vitest";
import {
  distanceKm,
  nearbyStations,
  proximityAdvice,
  stationSelection,
  type NearbyStation,
  type StationRecord,
} from "../../src/domain/stations.ts";
import { observationFreshness } from "../../src/app/stationApi.ts";
import type { WindSample } from "../../src/domain/types.ts";

const KLAMBY = { lat: 55.672956, lon: 13.75345 };

function record(over: Partial<StationRecord> = {}): StationRecord {
  return {
    key: "weewx:esmi",
    provider: "weewx",
    id: "esmi",
    name: "Sjöbo flygklubb · ESMI",
    // The real published position of Sjöbo flying club's station, as the
    // catalogue builder reads it from the feed itself.
    lat: 55.59303,
    lon: 13.682949,
    url: "https://vader.sjoboflyg.se/json/weewx_data.json",
    stationType: "Club weather station (WeeWX)",
    ...over,
  };
}

describe("finding a station near a site", () => {
  it("measures the distance the prototype measured", () => {
    // The acceptance case: Sjöbo ESMI is 9.9 km from Klamby. An
    // independent number that has to come out the same.
    const esmi = record();
    expect(distanceKm(KLAMBY, esmi)).toBeCloseTo(9.9, 1);
  });

  it("returns the nearest first", () => {
    const stations = [
      record({ key: "smhi:1", provider: "smhi", id: "1", lat: 56.2, lon: 13.75 }),
      record(),
      record({ key: "smhi:2", provider: "smhi", id: "2", lat: 55.71, lon: 13.75 }),
    ];
    expect(nearbyStations(stations, KLAMBY, 100).map((s) => s.key)).toEqual(["smhi:2", "weewx:esmi", "smhi:1"]);
  });

  it("excludes what is outside the radius", () => {
    const stations = [record(), record({ key: "smhi:1", provider: "smhi", id: "1", lat: 57.5, lon: 13.75 })];
    expect(nearbyStations(stations, KLAMBY, 25).map((s) => s.key)).toEqual(["weewx:esmi"]);
  });

  it("can be narrowed to particular providers", () => {
    const stations = [record(), record({ key: "smhi:1", provider: "smhi", id: "1", lat: 55.7, lon: 13.75 })];
    expect(nearbyStations(stations, KLAMBY, 50, ["smhi"]).map((s) => s.key)).toEqual(["smhi:1"]);
  });

  it("is stable when two stations are the same distance away", () => {
    // Two records at one airport must not swap places between renders.
    const a = record({ key: "metar:ESMS", provider: "metar", id: "ESMS", lat: 55.7, lon: 13.75 });
    const b = record({ key: "smhi:9", provider: "smhi", id: "9", lat: 55.7, lon: 13.75 });
    expect(nearbyStations([b, a], KLAMBY, 50).map((s) => s.key)).toEqual(["metar:ESMS", "smhi:9"]);
  });

  it("returns nothing rather than throwing when the site has no coordinates yet", () => {
    expect(nearbyStations([record()], { lat: Number.NaN, lon: Number.NaN }, 25)).toEqual([]);
    expect(nearbyStations([record()], { lat: 999, lon: 0 }, 25)).toEqual([]);
  });

  it("describes distance in words without pretending to know the terrain", () => {
    expect(proximityAdvice(2)).toBe("close");
    expect(proximityAdvice(9.9)).toBe("nearby");
    expect(proximityAdvice(40)).toBe("far");
  });
});

describe("turning a choice into a station record", () => {
  const nearby: NearbyStation = { ...record(), distanceKm: 9.9 };

  it("fills every field the collector needs, URL included", () => {
    // The URL was the missing link: a club feed has no directory, so
    // without it the saved station can never be read.
    const selection = stationSelection(nearby);
    expect(selection).toMatchObject({
      name: "Sjöbo flygklubb · ESMI",
      provider: "weewx",
      station_id: "esmi",
      url: "https://vader.sjoboflyg.se/json/weewx_data.json",
    });
  });

  it("omits the URL where the station id is the identity", () => {
    const selection = stationSelection({ ...nearby, provider: "holfuy", id: "214", url: undefined });
    expect(selection.url).toBeUndefined();
  });

  it("never sets verified - that is a claim about flying, not about a feed", () => {
    // The behaviour this replaces marked a station verified because its
    // provider field was non-empty.
    expect(stationSelection(nearby)).not.toHaveProperty("verified");
  });

  it("records the distance and says outright that suitability is unverified", () => {
    const note = stationSelection(nearby).note;
    expect(note).toContain("9.9 km");
    expect(note).toMatch(/not verified/i);
  });
});

describe("how fresh a reading is", () => {
  function sample(over: Partial<WindSample> = {}): WindSample {
    return {
      sourceId: "weewx",
      sourceKind: "observation",
      timestamp: new Date(Date.now() - 60_000).toISOString(),
      windDirectionDeg: 269,
      windSpeedMs: 2.1,
      windGustMs: 4.1,
      ...over,
    };
  }

  it("is fresh when recent, stale past the source's own interval", () => {
    expect(observationFreshness(sample())).toBe("fresh");
    expect(
      observationFreshness(sample({ timestamp: new Date(Date.now() - 40 * 60_000).toISOString(), staleAfterMinutes: 20 })),
    ).toBe("stale");
    // An airport report is hourly, so 40 minutes old is normal for it.
    expect(
      observationFreshness(sample({ timestamp: new Date(Date.now() - 40 * 60_000).toISOString(), staleAfterMinutes: 90 })),
    ).toBe("fresh");
  });

  it("says the age is unknown rather than guessing, when the source published no date", () => {
    // Holfuy: the reading arrived a second ago and may be hours old.
    expect(observationFreshness(sample({ ageConfirmed: false }))).toBe("unknown-age");
  });

  it("treats a flagged reading, and a reading from the future, as suspect", () => {
    expect(observationFreshness(sample({ quality: "suspect" }))).toBe("suspect");
    expect(observationFreshness(sample({ timestamp: new Date(Date.now() + 600_000).toISOString() }))).toBe("suspect");
  });

  it("does not crash on an unparseable timestamp", () => {
    expect(observationFreshness(sample({ timestamp: "not a time" }))).toBe("unknown-age");
  });
});
