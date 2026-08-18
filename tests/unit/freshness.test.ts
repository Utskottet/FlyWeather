import { describe, expect, it } from "vitest";
import { classifyFreshness } from "../../src/domain/freshness.ts";

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
