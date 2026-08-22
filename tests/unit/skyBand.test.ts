import { describe, expect, it } from "vitest";
import { getTimes } from "suncalc";
import {
  SOUTH_SWEDEN_REPRESENTATIVE_LOCATION,
  buildSkyBandBlocks,
  classifySkyBand,
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
