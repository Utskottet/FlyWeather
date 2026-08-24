import { describe, expect, it } from "vitest";
import { classifyFreshness, formatDownloadTime } from "../../src/domain/freshness.ts";

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

describe("formatDownloadTime", () => {
  // now = 2026-08-18T12:00:00Z = 14:00 Europe/Stockholm (CEST, UTC+2 in August)
  const now = new Date("2026-08-18T12:00:00Z");

  it("shows TODAY when the timestamp is the same Stockholm calendar day as now", () => {
    expect(formatDownloadTime("2026-08-18T10:00:00Z", now)).toBe("12:00 TODAY");
  });

  it("shows the short weekday when the timestamp is a different Stockholm calendar day", () => {
    expect(formatDownloadTime("2026-08-17T10:00:00Z", now)).toBe("12:00 MON");
  });

  it("compares calendar days in Stockholm time, not the raw UTC date - a timestamp just after Stockholm midnight still reads as a new day", () => {
    // 2026-08-17T22:30:00Z is 00:30 on 2026-08-18 in Stockholm (CEST) -
    // same Stockholm day as `now`, even though the UTC dates differ.
    expect(formatDownloadTime("2026-08-17T22:30:00Z", now)).toBe("00:30 TODAY");
  });
});
