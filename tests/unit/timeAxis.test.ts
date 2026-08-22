import { describe, expect, it } from "vitest";
import {
  classifyTick,
  findNowIndex,
  formatSliderLabel,
  nowPositionFraction,
  tickDayLabel,
} from "../../src/domain/timeAxis.ts";

describe("formatSliderLabel", () => {
  const now = new Date("2026-08-18T13:00:00Z"); // 15:00 Europe/Stockholm (CEST, UTC+2) in August

  it("returns NOW when isNow is true regardless of the date", () => {
    expect(formatSliderLabel(now, now, true)).toBe("NOW");
  });

  it("returns just the local hour for a time on the same Stockholm calendar day", () => {
    const sameDay = new Date("2026-08-18T15:00:00Z"); // 17:00 Stockholm
    expect(formatSliderLabel(sameDay, now, false)).toBe("17");
  });

  it("returns weekday + hour once the Stockholm calendar day changes", () => {
    const nextDay = new Date("2026-08-19T07:00:00Z"); // 09:00 Stockholm, Wednesday
    const label = formatSliderLabel(nextDay, now, false);
    expect(label).toMatch(/^[A-Z]{3} 09$/);
  });
});

describe("findNowIndex", () => {
  it("finds the first hour at or after now", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00", "2026-08-18T12:00", "2026-08-18T13:00"];
    expect(findNowIndex(hours, new Date("2026-08-18T11:30"))).toBe(2);
  });

  it("returns 0 when now is before every hour", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00"];
    expect(findNowIndex(hours, new Date("2026-08-18T05:00"))).toBe(0);
  });

  it("returns the last index when now is after every hour", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00"];
    expect(findNowIndex(hours, new Date("2026-08-19T00:00"))).toBe(1);
  });
});

describe("classifyTick (§ time slider graduations, Block 12)", () => {
  it("classifies local midnight as a day tick", () => {
    expect(classifyTick(new Date("2026-08-18T22:00:00Z"))).toBe("day"); // 00:00 Stockholm (CEST, UTC+2)
  });

  it("classifies local 06/12/18 as six-hour ticks", () => {
    expect(classifyTick(new Date("2026-08-18T04:00:00Z"))).toBe("six-hour"); // 06:00 Stockholm
    expect(classifyTick(new Date("2026-08-18T10:00:00Z"))).toBe("six-hour"); // 12:00 Stockholm
    expect(classifyTick(new Date("2026-08-18T16:00:00Z"))).toBe("six-hour"); // 18:00 Stockholm
  });

  it("classifies every other hour as a plain hour tick", () => {
    expect(classifyTick(new Date("2026-08-18T13:00:00Z"))).toBe("hour"); // 15:00 Stockholm
  });
});

describe("tickDayLabel", () => {
  it("returns a short uppercase weekday abbreviation", () => {
    expect(tickDayLabel(new Date("2026-08-18T22:00:00Z"))).toMatch(/^[A-Z]{3}$/);
  });
});

describe("nowPositionFraction", () => {
  const hours = ["2026-08-18T10:00:00Z", "2026-08-18T11:00:00Z", "2026-08-18T12:00:00Z", "2026-08-18T13:00:00Z"];

  it("returns null when there's no track to position against", () => {
    expect(nowPositionFraction([], new Date())).toBeNull();
    expect(nowPositionFraction(["2026-08-18T10:00:00Z"], new Date())).toBeNull();
  });

  it("clamps to 0 when now is at or before the first hour", () => {
    expect(nowPositionFraction(hours, new Date("2026-08-18T09:00:00Z"))).toBe(0);
    expect(nowPositionFraction(hours, new Date("2026-08-18T10:00:00Z"))).toBe(0);
  });

  it("clamps to 1 when now is at or after the last hour", () => {
    expect(nowPositionFraction(hours, new Date("2026-08-18T13:00:00Z"))).toBe(1);
    expect(nowPositionFraction(hours, new Date("2026-08-19T00:00:00Z"))).toBe(1);
  });

  it("lands exactly on an index's fraction when now matches an hourly tick", () => {
    expect(nowPositionFraction(hours, new Date("2026-08-18T12:00:00Z"))).toBeCloseTo(2 / 3, 5);
  });

  it("interpolates between two bracketing hours - moving the slider never changes this, only real time does", () => {
    expect(nowPositionFraction(hours, new Date("2026-08-18T11:30:00Z"))).toBeCloseTo(1.5 / 3, 5);
  });
});

describe("DST handling (Europe/Stockholm) - not near today's date, but must always hold", () => {
  it("spring-forward 2026-03-29: local clocks skip 02:00-03:00 CET/CEST (jump by 2, not 1)", () => {
    const before = formatSliderLabel(new Date("2026-03-29T00:00:00Z"), new Date("2026-03-29T00:00:00Z"), false);
    const after = formatSliderLabel(new Date("2026-03-29T01:00:00Z"), new Date("2026-03-29T01:00:00Z"), false);
    expect(before).toBe("01"); // 00:00Z = 01:00 CET
    expect(after).toBe("03"); // 01:00Z = 03:00 CEST - 02:00-03:00 never happens that day
  });

  it("fall-back 2026-10-25: local clocks repeat 02:00-03:00 CEST/CET (does not advance)", () => {
    const before = formatSliderLabel(new Date("2026-10-25T00:00:00Z"), new Date("2026-10-25T00:00:00Z"), false);
    const after = formatSliderLabel(new Date("2026-10-25T01:00:00Z"), new Date("2026-10-25T01:00:00Z"), false);
    expect(before).toBe("02"); // 00:00Z = 02:00 CEST
    expect(after).toBe("02"); // 01:00Z = 02:00 CET - the repeated hour, same label
  });

  it("nowPositionFraction stays monotonic across the spring-forward transition", () => {
    // Real UTC instants an hour apart, straddling the transition - the
    // function works entirely in UTC epoch time internally, so DST must
    // never cause it to go backwards or misorder.
    const dstHours = ["2026-03-29T00:00:00Z", "2026-03-29T01:00:00Z", "2026-03-29T02:00:00Z"];
    const early = nowPositionFraction(dstHours, new Date("2026-03-29T00:15:00Z"));
    const late = nowPositionFraction(dstHours, new Date("2026-03-29T01:45:00Z"));
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(late as number).toBeGreaterThan(early as number);
  });
});
