import { describe, expect, it } from "vitest";
import { classifyFreshness, formatAge } from "../../src/domain/freshness.ts";

describe("classifyFreshness (§11.2)", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("is fresh at or under the fresh threshold", () => {
    expect(classifyFreshness("2026-08-18T11:50:00Z", now, 10, 30)).toBe("fresh");
    expect(classifyFreshness("2026-08-18T12:00:00Z", now, 10, 30)).toBe("fresh");
  });

  it("is aging between the fresh and stale thresholds", () => {
    expect(classifyFreshness("2026-08-18T11:40:00Z", now, 10, 30)).toBe("aging");
  });

  it("is stale beyond the stale threshold", () => {
    expect(classifyFreshness("2026-08-18T11:00:00Z", now, 10, 30)).toBe("stale");
  });

  it("treats a future timestamp as fresh rather than crashing (flagged suspect elsewhere, §31)", () => {
    expect(classifyFreshness("2026-08-18T12:05:00Z", now, 10, 30)).toBe("fresh");
  });
});

describe("formatAge", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("formats sub-hour ages in minutes", () => {
    expect(formatAge("2026-08-18T12:00:00Z", now)).toBe("0m");
    expect(formatAge("2026-08-18T11:53:00Z", now)).toBe("7m");
    expect(formatAge("2026-08-18T11:01:00Z", now)).toBe("59m");
  });

  it("formats hour-plus ages as hours and minutes, omitting minutes when exact", () => {
    expect(formatAge("2026-08-18T11:00:00Z", now)).toBe("1h");
    expect(formatAge("2026-08-18T10:35:00Z", now)).toBe("1h 25m");
  });

  it("formats day-plus ages as days and hours, omitting hours when exact", () => {
    expect(formatAge("2026-08-16T12:00:00Z", now)).toBe("2d");
    expect(formatAge("2026-08-16T09:00:00Z", now)).toBe("2d 3h");
  });

  it("clamps a future timestamp to 0m rather than going negative", () => {
    expect(formatAge("2026-08-18T12:30:00Z", now)).toBe("0m");
  });
});
