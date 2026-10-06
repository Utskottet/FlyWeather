import { describe, expect, it } from "vitest";
import {
  MOBILE_HOUR_WIDTH_PX,
  classifyTick,
  findNowIndex,
  formatSliderLabel,
  groupHoursByLocalDay,
  indexFromScrollLeft,
  nowPositionFraction,
  scrollLeftForIndex,
  tickDayLabel,
  tickHourLabel,
} from "../../src/domain/timeAxis.ts";

describe("formatSliderLabel", () => {
  const now = new Date("2026-08-18T13:00:00Z"); // 15:00 Europe/Stockholm (CEST, UTC+2) in August

  it("keeps the word NOW but still states the day and clock time", () => {
    expect(formatSliderLabel(now, true)).toBe("NOW · Tue 15:00");
  });

  it("states day and clock time for a time on the same Stockholm calendar day", () => {
    const sameDay = new Date("2026-08-18T15:00:00Z"); // 17:00 Stockholm
    expect(formatSliderLabel(sameDay, false)).toBe("Tue 17:00");
  });

  it("states day and clock time once the Stockholm calendar day changes", () => {
    const nextDay = new Date("2026-08-19T07:00:00Z"); // 09:00 Stockholm, Wednesday
    expect(formatSliderLabel(nextDay, false)).toBe("Wed 09:00");
  });
});

describe("findNowIndex", () => {
  it("finds the first hour at or after now", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00", "2026-08-18T12:00", "2026-08-18T13:00"];
    // Both sides explicitly UTC. This used to read "11:30" as local time
    // against hours read as local time - two wrongs that agreed with each
    // other, which is how the two-hour display offset stayed hidden.
    expect(findNowIndex(hours, new Date("2026-08-18T11:30:00Z"))).toBe(2);
  });

  it("returns 0 when now is before every hour", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00"];
    expect(findNowIndex(hours, new Date("2026-08-18T05:00:00Z"))).toBe(0);
  });

  it("returns the last index when now is after every hour", () => {
    const hours = ["2026-08-18T10:00", "2026-08-18T11:00"];
    expect(findNowIndex(hours, new Date("2026-08-19T00:00:00Z"))).toBe(1);
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

describe("tickHourLabel", () => {
  it("returns a zero-padded local hour, e.g. 06/12/18", () => {
    expect(tickHourLabel(new Date("2026-08-18T04:00:00Z"))).toBe("06"); // 06:00 Stockholm
    expect(tickHourLabel(new Date("2026-08-18T10:00:00Z"))).toBe("12"); // 12:00 Stockholm
    expect(tickHourLabel(new Date("2026-08-18T16:00:00Z"))).toBe("18"); // 18:00 Stockholm
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
    const before = formatSliderLabel(new Date("2026-03-29T00:00:00Z"), false);
    const after = formatSliderLabel(new Date("2026-03-29T01:00:00Z"), false);
    expect(before).toBe("Sun 01:00"); // 00:00Z = 01:00 CET
    expect(after).toBe("Sun 03:00"); // 01:00Z = 03:00 CEST - 02:00-03:00 never happens that day
  });

  it("fall-back 2026-10-25: local clocks repeat 02:00-03:00 CEST/CET (does not advance)", () => {
    const before = formatSliderLabel(new Date("2026-10-25T00:00:00Z"), false);
    const after = formatSliderLabel(new Date("2026-10-25T01:00:00Z"), false);
    expect(before).toBe("Sun 02:00"); // 00:00Z = 02:00 CEST
    expect(after).toBe("Sun 02:00"); // 01:00Z = 02:00 CET - the repeated hour, same label
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

describe("groupHoursByLocalDay (mobile timeline day columns)", () => {
  it("groups consecutive same-local-day hours into one day, with title/number/weekday", () => {
    // 2026-10-06T00:00Z..05:00Z = 02:00..07:00 CEST (UTC+2) - all Oct 6 local.
    const hours = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(2026, 9, 6, i)).toISOString());
    const groups = groupHoursByLocalDay(hours);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "2026-10-06", weekday: "TUE", weekdayTitle: "Tue", dayOfMonth: 6 });
    expect(groups[0].indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("splits at local midnight, not UTC midnight", () => {
    // 22:00Z Oct 6 is 00:00 CEST Oct 7 - a new local day.
    const hours = ["2026-10-06T21:00:00Z", "2026-10-06T22:00:00Z", "2026-10-06T23:00:00Z"];
    const groups = groupHoursByLocalDay(hours);

    expect(groups.map((g) => g.indices.length)).toEqual([1, 2]);
    expect(groups[1].weekday).toBe("WED");
  });

  it("keeps the spring-forward day as one group despite the skipped hour", () => {
    const hours = [
      "2026-03-28T23:00:00Z", // 00:00 CET Mar 29
      "2026-03-29T00:00:00Z", // 01:00 CET
      "2026-03-29T01:00:00Z", // 03:00 CEST - 02:00 local never happens
      "2026-03-29T02:00:00Z", // 04:00 CEST
      "2026-03-29T03:00:00Z", // 05:00 CEST
    ];
    const groups = groupHoursByLocalDay(hours);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-03-29");
    expect(groups[0].indices).toHaveLength(5);
  });

  it("keeps the fall-back repeated hour in the same group and starts the next day at local midnight", () => {
    const hours = [
      "2026-10-24T22:00:00Z", // 00:00 CEST Oct 25
      "2026-10-24T23:00:00Z", // 01:00 CEST
      "2026-10-25T00:00:00Z", // 02:00 CEST
      "2026-10-25T01:00:00Z", // 02:00 CET - the repeated hour
      "2026-10-25T02:00:00Z", // 03:00 CET
      "2026-10-25T23:00:00Z", // 00:00 CET Oct 26
    ];
    const groups = groupHoursByLocalDay(hours);

    expect(groups.map((g) => g.indices.length)).toEqual([5, 1]);
    expect(groups[0].key).toBe("2026-10-25");
    expect(groups[1].key).toBe("2026-10-26");
  });

  it("returns no groups for no hours", () => {
    expect(groupHoursByLocalDay([])).toEqual([]);
  });
});

describe("mobile scroll/timestamp mapping", () => {
  it("round-trips an hour index through its scroll position", () => {
    for (const index of [0, 1, 6, 24, 72]) {
      expect(indexFromScrollLeft(scrollLeftForIndex(index), MOBILE_HOUR_WIDTH_PX, 72)).toBe(index);
    }
  });

  it("rounds to the nearest hour", () => {
    expect(indexFromScrollLeft(MOBILE_HOUR_WIDTH_PX * 3.4, MOBILE_HOUR_WIDTH_PX, 72)).toBe(3);
    expect(indexFromScrollLeft(MOBILE_HOUR_WIDTH_PX * 3.6, MOBILE_HOUR_WIDTH_PX, 72)).toBe(4);
  });

  it("clamps below zero and above the last hour", () => {
    expect(indexFromScrollLeft(-500, MOBILE_HOUR_WIDTH_PX, 72)).toBe(0);
    expect(indexFromScrollLeft(100_000, MOBILE_HOUR_WIDTH_PX, 72)).toBe(72);
  });

  it("degrades to 0 with no hours or a zero hour width", () => {
    expect(indexFromScrollLeft(123, MOBILE_HOUR_WIDTH_PX, 0)).toBe(0);
    expect(indexFromScrollLeft(123, 0, 72)).toBe(0);
  });
});
