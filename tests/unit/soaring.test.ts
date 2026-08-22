import { describe, expect, it } from "vitest";
import { findFileForValidTime, findNearestValidTime, type SoaringParameter } from "../../src/domain/soaring.ts";

describe("findNearestValidTime", () => {
  const validTimes = ["2026-08-22T06:00:00Z", "2026-08-22T07:00:00Z", "2026-08-22T09:00:00Z"];

  it("returns an exact match when one exists", () => {
    expect(findNearestValidTime(validTimes, "2026-08-22T07:00:00Z")).toBe("2026-08-22T07:00:00Z");
  });

  it("returns the nearest time within tolerance when there's no exact match", () => {
    // 07:15 is 15 min from 07:00, well within the 30 min default tolerance.
    expect(findNearestValidTime(validTimes, "2026-08-22T07:15:00Z")).toBe("2026-08-22T07:00:00Z");
  });

  it("picks the CLOSER of two candidates, not just the first", () => {
    // 08:50 is 50 min from 07:00 but only 10 min from 09:00.
    expect(findNearestValidTime(validTimes, "2026-08-22T08:50:00Z")).toBe("2026-08-22T09:00:00Z");
  });

  it("returns null when nothing is within tolerance - never silently shows the wrong hour", () => {
    // 12:00 is 3h from the nearest published time (09:00) - way outside 30 min.
    expect(findNearestValidTime(validTimes, "2026-08-22T12:00:00Z")).toBeNull();
  });

  it("respects a custom tolerance", () => {
    expect(findNearestValidTime(validTimes, "2026-08-22T07:25:00Z", 20)).toBeNull();
    expect(findNearestValidTime(validTimes, "2026-08-22T07:25:00Z", 30)).toBe("2026-08-22T07:00:00Z");
  });

  it("returns null for an empty validTimes list", () => {
    expect(findNearestValidTime([], "2026-08-22T07:00:00Z")).toBeNull();
  });

  it("returns null for an unparseable target timestamp", () => {
    expect(findNearestValidTime(validTimes, "not-a-real-timestamp")).toBeNull();
  });

  it("skips unparseable entries in validTimes rather than throwing", () => {
    const withGarbage = ["garbage", "2026-08-22T07:00:00Z"];
    expect(findNearestValidTime(withGarbage, "2026-08-22T07:05:00Z")).toBe("2026-08-22T07:00:00Z");
  });

  it("is exactly at the tolerance boundary - inclusive", () => {
    // Exactly 30 minutes away.
    expect(findNearestValidTime(validTimes, "2026-08-22T06:30:00Z", 30)).toBe("2026-08-22T06:00:00Z");
  });
});

describe("findFileForValidTime", () => {
  const parameter: SoaringParameter = {
    label: "Thermal strength",
    technicalLabel: "W*",
    unit: "m/s",
    grid: { bbox: [8.9, 54.9, 15.0, 57.8], cols: 220, rows: 200 },
    colorScale: [],
    validTimes: ["2026-08-22T06:00:00Z", "2026-08-22T07:00:00Z"],
    files: [
      { validTime: "2026-08-22T06:00:00Z", raster: "wstar/2026-08-22T06-00Z.webp", numeric: "wstar/2026-08-22T06-00Z.json" },
      { validTime: "2026-08-22T07:00:00Z", raster: "wstar/2026-08-22T07-00Z.webp", numeric: "wstar/2026-08-22T07-00Z.json" },
    ],
  };

  it("finds the file entry matching a valid time", () => {
    const file = findFileForValidTime(parameter, "2026-08-22T07:00:00Z");
    expect(file?.raster).toBe("wstar/2026-08-22T07-00Z.webp");
  });

  it("returns null when no file matches", () => {
    expect(findFileForValidTime(parameter, "2026-08-22T09:00:00Z")).toBeNull();
  });
});
