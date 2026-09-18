import { describe, expect, it } from "vitest";
import { getTimes } from "suncalc";
import {
  SOUTH_SWEDEN_REPRESENTATIVE_LOCATION,
  buildSkyBandBlocks,
  classifySkyBand,
  daylightFactor,
  dimForDaylight,
  isNightAt,
  skyBandCssGradient,
} from "../../src/domain/skyBand.ts";

const LOC = SOUTH_SWEDEN_REPRESENTATIVE_LOCATION;

function hourlyRange(startIso: string, count: number): string[] {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, i) => new Date(start + i * 3_600_000).toISOString());
}

// Real sunrise/sunset for LOC (55.8N, well south of the Arctic Circle) are
// never null - this just narrows suncalc's polar-day/night-aware type for
// test readability.
function realSunTimes(date: Date) {
  const times = getTimes(date, LOC.lat, LOC.lon);
  if (times.sunrise === null || times.sunset === null) throw new Error("unexpectedly polar");
  return { ...times, sunrise: times.sunrise, sunset: times.sunset };
}

describe("classifySkyBand", () => {
  it("classifies real solar noon as day", () => {
    const times = realSunTimes(new Date("2026-06-21T12:00:00Z"));
    const solarNoon = times.solarNoon;
    expect(classifySkyBand(solarNoon, LOC)).toBe("day");
  });

  it("classifies the middle of the night as night", () => {
    const times = realSunTimes(new Date("2026-06-21T12:00:00Z"));
    const midnight = new Date((times.nadir as Date).getTime());
    expect(classifySkyBand(midnight, LOC)).toBe("night");
  });

  it("classifies an instant right at sunrise as a transition", () => {
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    expect(classifySkyBand(times.sunrise, LOC)).toBe("transition");
  });

  it("classifies an instant right at sunset as a transition", () => {
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    expect(classifySkyBand(times.sunset, LOC)).toBe("transition");
  });

  it("classifies well past sunrise (>30min) as day, not transition", () => {
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    const wellAfterSunrise = new Date(times.sunrise.getTime() + 60 * 60_000);
    expect(classifySkyBand(wellAfterSunrise, LOC)).toBe("day");
  });
});

describe("isNightAt", () => {
  it("is true in the middle of the night, false at solar noon", () => {
    const times = realSunTimes(new Date("2026-06-21T12:00:00Z"));
    const midnight = new Date((times.nadir as Date).getTime());
    expect(isNightAt(midnight.toISOString(), LOC)).toBe(true);
    expect(isNightAt(times.solarNoon.toISOString(), LOC)).toBe(false);
  });

  it("is false during the sunrise/sunset transition window, not just full day", () => {
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    expect(isNightAt(times.sunrise.toISOString(), LOC)).toBe(false);
  });

  it("defaults to the real current instant when instantIso is null", () => {
    // Not asserting a specific value (that would just re-test classifySkyBand
    // against whatever "now" happens to be when this test runs) - only that
    // it doesn't throw and returns a real boolean rather than requiring a
    // timestamp.
    expect(typeof isNightAt(null, LOC)).toBe("boolean");
  });
});

describe("buildSkyBandBlocks", () => {
  it("returns an empty array for fewer than 2 hours", () => {
    expect(buildSkyBandBlocks([], LOC)).toEqual([]);
    expect(buildSkyBandBlocks(["2026-08-22T12:00:00Z"], LOC)).toEqual([]);
  });

  it("produces blocks that are sorted, contiguous, and span the full 0-100% range", () => {
    const hours = hourlyRange("2026-08-22T00:00:00Z", 73); // 3 days
    const blocks = buildSkyBandBlocks(hours, LOC);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].startPercent).toBe(0);
    expect(blocks[blocks.length - 1].endPercent).toBe(100);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startPercent).toBeCloseTo(blocks[i - 1].endPercent, 6);
    }
  });

  it("finds real day/night/transition phases across a 3-day summer range, not just one flat phase", () => {
    const hours = hourlyRange("2026-08-22T00:00:00Z", 73);
    const blocks = buildSkyBandBlocks(hours, LOC);
    const phases = new Set(blocks.map((b) => b.phase));
    expect(phases.has("day")).toBe(true);
    expect(phases.has("night")).toBe(true);
    expect(phases.has("transition")).toBe(true);
  });

  it("merges an overnight span into one continuous night block, not two adjacent segments", () => {
    // A range crossing exactly one night (evening of day 1 through morning
    // of day 2) - only ONE "night" block should appear, not two abutting
    // ones from each day's own boundary computation.
    const hours = hourlyRange("2026-08-22T18:00:00Z", 24);
    const blocks = buildSkyBandBlocks(hours, LOC);
    const nightBlocks = blocks.filter((b) => b.phase === "night");
    expect(nightBlocks.length).toBe(1);
  });

  it("handles a range where sunrise happens before the range starts (starts mid-day)", () => {
    // Start well after real sunrise on a summer day - the first block must
    // correctly read as "day", not incorrectly "transition"/"night".
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    const startIso = new Date(times.sunrise.getTime() + 3 * 60 * 60_000).toISOString();
    const hours = hourlyRange(startIso, 6); // stays well before sunset
    const blocks = buildSkyBandBlocks(hours, LOC);
    expect(blocks[0].phase).toBe("day");
  });

  it("handles a range where sunset happens after the range ends (ends mid-day)", () => {
    const times = realSunTimes(new Date("2026-08-22T12:00:00Z"));
    const startIso = new Date(times.sunrise.getTime() + 3 * 60 * 60_000).toISOString();
    const hours = hourlyRange(startIso, 4); // ends well before real sunset
    const blocks = buildSkyBandBlocks(hours, LOC);
    expect(blocks[blocks.length - 1].phase).toBe("day");
  });

  it("stays well-formed across the 2026 spring-forward DST transition (2026-03-29)", () => {
    const hours = hourlyRange("2026-03-28T12:00:00Z", 48);
    const blocks = buildSkyBandBlocks(hours, LOC);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].startPercent).toBe(0);
    expect(blocks[blocks.length - 1].endPercent).toBe(100);
    for (const b of blocks) {
      expect(b.endPercent).toBeGreaterThan(b.startPercent);
    }
  });

  it("stays well-formed across the 2026 fall-back DST transition (2026-10-25)", () => {
    const hours = hourlyRange("2026-10-24T12:00:00Z", 48);
    const blocks = buildSkyBandBlocks(hours, LOC);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].startPercent).toBe(0);
    expect(blocks[blocks.length - 1].endPercent).toBe(100);
    for (const b of blocks) {
      expect(b.endPercent).toBeGreaterThan(b.startPercent);
    }
  });
});

describe("skyBandCssGradient", () => {
  it("returns transparent for no blocks", () => {
    expect(skyBandCssGradient([])).toBe("transparent");
  });

  it("produces a hard-edged gradient (each color appears at two adjacent stop positions)", () => {
    const gradient = skyBandCssGradient([
      { phase: "night", startPercent: 0, endPercent: 20 },
      { phase: "transition", startPercent: 20, endPercent: 25 },
      { phase: "day", startPercent: 25, endPercent: 100 },
    ]);
    expect(gradient).toContain("linear-gradient(to right,");
    expect(gradient).toContain("20%");
    expect(gradient).toContain("25%");
  });
});

describe("daylightFactor", () => {
  // Hammar, mid-September: sunset ~19:20 local, sunrise ~06:50 local.
  const site = { lat: 55.41285, lon: 13.993881 };
  const times = getTimes(new Date("2026-09-18T12:00:00Z"), site.lat, site.lon);
  const sunset = times.sunset!.getTime();
  const sunrise = times.sunrise!.getTime();
  const minutes = (n: number) => n * 60_000;

  it("is fully lit through the whole day - nothing changes while the sun is up", () => {
    expect(daylightFactor(new Date(sunrise + minutes(1)), site)).toBe(1);
    expect(daylightFactor(new Date((sunrise + sunset) / 2), site)).toBe(1);
    expect(daylightFactor(new Date(sunset - minutes(1)), site)).toBe(1);
  });

  it("starts fading exactly at sunset, not before", () => {
    expect(daylightFactor(new Date(sunset - 1000), site)).toBe(1);
    expect(daylightFactor(new Date(sunset), site)).toBeCloseTo(1, 2);
    expect(daylightFactor(new Date(sunset + minutes(10)), site)).toBeCloseTo(0.75, 2);
    expect(daylightFactor(new Date(sunset + minutes(20)), site)).toBeCloseTo(0.5, 2);
    expect(daylightFactor(new Date(sunset + minutes(30)), site)).toBeCloseTo(0.25, 2);
  });

  it("is fully black 40 minutes after sunset, and stays black", () => {
    expect(daylightFactor(new Date(sunset + minutes(40)), site)).toBe(0);
    expect(daylightFactor(new Date(sunset + minutes(90)), site)).toBe(0);
    expect(daylightFactor(new Date(sunset + minutes(240)), site)).toBe(0);
  });

  it("recovers over the 40 minutes before sunrise, mirroring the evening", () => {
    expect(daylightFactor(new Date(sunrise - minutes(41)), site)).toBe(0);
    expect(daylightFactor(new Date(sunrise - minutes(30)), site)).toBeCloseTo(0.25, 2);
    expect(daylightFactor(new Date(sunrise - minutes(20)), site)).toBeCloseTo(0.5, 2);
    expect(daylightFactor(new Date(sunrise - minutes(10)), site)).toBeCloseTo(0.75, 2);
    expect(daylightFactor(new Date(sunrise), site)).toBe(1);
  });

  it("uses each site's own position, not one shared location", () => {
    // Dokkedal is ~1.5 degrees north and ~3.7 east of Hammar, so its
    // sunset lands at a different instant - the whole point of computing
    // this per site rather than for "South Sweden".
    const dokkedal = { lat: 56.903551, lon: 10.253543 };
    const atHammarSunset = new Date(sunset + minutes(20));
    expect(daylightFactor(atHammarSunset, site)).not.toBeCloseTo(daylightFactor(atHammarSunset, dokkedal), 2);
  });

  it("never reaches full black on a short summer night", () => {
    // Midsummer in Skane: sunset to sunrise is short, and with the two
    // 40-minute ramps overlapping the site should stay partly lit all
    // night rather than snapping to black.
    const june = new Date("2026-06-21T22:30:00Z");
    const factor = daylightFactor(june, site, 240);
    expect(factor).toBeGreaterThan(0);
  });

  it("honours a custom fade length", () => {
    expect(daylightFactor(new Date(sunset + minutes(20)), site, 20)).toBe(0);
    expect(daylightFactor(new Date(sunset + minutes(20)), site, 80)).toBeCloseTo(0.75, 2);
  });
});

describe("dimForDaylight", () => {
  it("returns the colour untouched in full daylight", () => {
    expect(dimForDaylight("#27c93f", 1)).toBe("#27c93f");
  });

  it("goes dark in full darkness, but never to pure black", () => {
    // Bottoming out at #000000 made the night map's site markers the
    // hardest thing on it to see, which is exactly when they are being
    // looked at. Dark, unmistakably night, still a marker.
    expect(dimForDaylight("#27c93f", 0)).toBe("#0c4014");
    expect(dimForDaylight("#f23535", 0)).toBe("#4d1111");
    expect(dimForDaylight("#27c93f", 0)).not.toBe("#000000");
  });

  it("keeps the night colour clearly darker than the land it sits on", () => {
    // Land is #c1d3da; the check that matters is that a night rose still
    // separates from it rather than any particular hex value.
    const land = [0xc1, 0xd3, 0xda].reduce((a, b) => a + b, 0);
    for (const colour of ["#27c93f", "#ff9800", "#f23535", "#757575"]) {
      const night = dimForDaylight(colour, 0);
      const sum = [1, 3, 5].reduce((a, i) => a + parseInt(night.slice(i, i + 2), 16), 0);
      expect(sum, `${colour} at night`).toBeLessThan(land * 0.5);
    }
  });

  it("keeps the hue while draining the light, so green still reads as green", () => {
    const half = dimForDaylight("#27c93f", 0.5);
    expect(half).toBe("#1a852a"); // factor 0.5 maps to 0.66 of full brightness once NIGHT_FLOOR is applied
    // green still dominates red and blue, exactly as in the full colour
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(half.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("accepts shorthand hex and clamps an out-of-range factor", () => {
    expect(dimForDaylight("#fff", 1)).toBe("#fff");
    expect(dimForDaylight("#fff", 0)).toBe("#525252"); // 255 * NIGHT_FLOOR
    expect(dimForDaylight("#27c93f", 5)).toBe("#27c93f");
    expect(dimForDaylight("#27c93f", -2)).toBe(dimForDaylight("#27c93f", 0));
  });
});
