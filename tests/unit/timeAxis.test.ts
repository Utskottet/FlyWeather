import { describe, expect, it } from "vitest";
import { classifyTick, findNowIndex, formatSliderLabel, tickDayLabel } from "../../src/domain/timeAxis.ts";

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
