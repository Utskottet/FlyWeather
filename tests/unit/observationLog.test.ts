import { describe, expect, it } from "vitest";
import {
  appendObservations,
  buildObservationRow,
  leadHours,
  monthFileName,
  observationKey,
  parseObservations,
  recordedKeys,
  serialiseObservation,
  type ObservationRow,
} from "../../src/domain/observationLog.ts";

function input(over: Partial<Parameters<typeof buildObservationRow>[0]> = {}) {
  return {
    at: "2026-09-21T17:20:09Z",
    site: "hovs-hallar-nv",
    hour: "2026-09-21T17:00",
    observedAt: "2026-09-21T17:19:58Z",
    obsMs: 9.166666666666668,
    obsDeg: 322,
    obsGust: 12.1,
    source: "holfuy",
    ageConfirmed: true,
    fcMs: 6.1,
    fcDeg: 316,
    fcGust: 8.4,
    fcIssued: "2026-09-21T16:58:33Z",
    ...over,
  };
}

describe("buildObservationRow", () => {
  it("pairs a reading with the forecast for the same hour", () => {
    const row = buildObservationRow(input());
    expect(row).not.toBeNull();
    expect(row!.obs.ms).toBeCloseTo(9.1667, 3);
    expect(row!.fc.ms).toBe(6.1);
  });

  it("stamps the hour with its zone, so the file never carries a bare timestamp", () => {
    // The whole point of domain/forecastTime.ts: a bare hour is ambiguous
    // to anything that reads it later, including us.
    expect(buildObservationRow(input())!.hour).toBe("2026-09-21T17:00Z");
  });

  it("records nothing when either side is missing", () => {
    // Half a pair verifies nothing and would put nulls in a file whose
    // only purpose is arithmetic later.
    expect(buildObservationRow(input({ obsMs: null }))).toBeNull();
    expect(buildObservationRow(input({ fcMs: null }))).toBeNull();
  });

  it("refuses to pair a reading taken too far from the hour it would describe", () => {
    // A two-hour offset once hid inside a 30-minute tolerance. This is
    // the same tolerance, applied deliberately and with a test.
    expect(buildObservationRow(input({ observedAt: "2026-09-21T19:19:58Z" }))).toBeNull();
    expect(buildObservationRow(input({ observedAt: "2026-09-21T17:29:00Z" }))).not.toBeNull();
  });

  it("keeps a missing gust missing rather than calling it zero", () => {
    const row = buildObservationRow(input({ obsGust: null }));
    expect(row!.obs.gust).toBeNull();
  });

  it("keeps a variable wind's direction null rather than inventing a bearing", () => {
    const row = buildObservationRow(input({ obsDeg: null }));
    expect(row!.obs.deg).toBeNull();
  });

  it("carries whether the station could prove when it measured", () => {
    // Holfuy's widget publishes a bare HH:MM with no date. Analysis has
    // to be able to exclude those rather than treat a download time as a
    // measurement time.
    expect(buildObservationRow(input({ ageConfirmed: false }))!.obs.ageConfirmed).toBe(false);
  });
});

describe("serialiseObservation", () => {
  it("rounds the anemometer's spurious precision away without pretending to accuracy", () => {
    const line = serialiseObservation(buildObservationRow(input())!);
    expect(line).toContain('"ms":9.17');
    expect(line).not.toContain("9.166666");
  });

  it("round-trips through the parser", () => {
    const row = buildObservationRow(input())!;
    const back = parseObservations(serialiseObservation(row));
    expect(back).toHaveLength(1);
    expect(back[0].site).toBe("hovs-hallar-nv");
    expect(back[0].hour).toBe("2026-09-21T17:00Z");
  });
});

describe("parseObservations", () => {
  it("skips an unreadable line instead of losing the month", () => {
    const good = serialiseObservation(buildObservationRow(input())!);
    expect(parseObservations(`${good}\n{ broken\n${good}\n`)).toHaveLength(2);
  });

  it("returns nothing for an empty or absent file", () => {
    expect(parseObservations("")).toEqual([]);
    expect(parseObservations(null)).toEqual([]);
  });
});

describe("recordedKeys", () => {
  /**
   * The recorder runs on an unreliable schedule and two runs can land in
   * the same hour. Counting one of them twice would let the scheduler,
   * rather than the weather, decide which hours carry more weight in
   * every average computed later.
   */
  it("recognises an hour already recorded, whichever spelling it used", () => {
    const rows = parseObservations(serialiseObservation(buildObservationRow(input())!));
    const keys = recordedKeys(rows);
    expect(keys.has(observationKey("hovs-hallar-nv", "2026-09-21T17:00"))).toBe(true);
    expect(keys.has(observationKey("hovs-hallar-nv", "2026-09-21T17:00Z"))).toBe(true);
    expect(keys.has(observationKey("hovs-hallar-nv", "2026-09-21T18:00Z"))).toBe(false);
    expect(keys.has(observationKey("molle", "2026-09-21T17:00Z"))).toBe(false);
  });
});

describe("appendObservations", () => {
  it("appends and always leaves the file newline-terminated", () => {
    const row = buildObservationRow(input())!;
    const first = appendObservations("", [row]);
    expect(first.endsWith("\n")).toBe(true);
    const second = appendObservations(first, [row]);
    expect(second.trim().split("\n")).toHaveLength(2);
    expect(second.endsWith("\n")).toBe(true);
  });

  it("leaves the file untouched when there is nothing to add", () => {
    expect(appendObservations("existing\n", [])).toBe("existing\n");
  });

  it("survives a file that lost its trailing newline", () => {
    const row = buildObservationRow(input())!;
    const out = appendObservations(serialiseObservation(row), [row]);
    expect(parseObservations(out)).toHaveLength(2);
  });
});

describe("monthFileName", () => {
  it("files rows by UTC month, so a year stays browsable", () => {
    expect(monthFileName("2026-09-21T17:20:09Z")).toBe("2026-09.jsonl");
    expect(monthFileName("2026-01-01T00:00:00Z")).toBe("2026-01.jsonl");
  });

  it("uses UTC, not the machine's month boundary", () => {
    // 23:30Z on the 30th is already October in Stockholm. The rows are
    // stamped in UTC and must be filed the same way, or a month boundary
    // would depend on where the recorder happened to run.
    expect(monthFileName("2026-09-30T23:30:00Z")).toBe("2026-09.jsonl");
  });
});

describe("the row shape a month of these has to support", () => {
  it("carries everything the bias analysis needs and nothing it does not", () => {
    const row: ObservationRow = buildObservationRow(input())!;
    expect(Object.keys(row).sort()).toEqual(["at", "fc", "hour", "obs", "site"]);
    expect(Object.keys(row.obs).sort()).toEqual(["ageConfirmed", "deg", "gust", "ms", "src"]);
    expect(Object.keys(row.fc).sort()).toEqual(["deg", "gust", "issued", "ms"]);
  });
});

describe("leadHours", () => {
  /**
   * Without this the file silently mixes forecasts issued minutes before
   * the hour with forecasts issued six hours before it, and a bias
   * figure over that mixture measures two different things at once. It
   * is not hypothetical: the first rows on 2026-09-22 were compared
   * against a 6.5-hour-old forecast, because Open-Meteo was rate-limiting
   * the refresh job.
   */
  it("recovers how far ahead the forecast was predicting", () => {
    const row = buildObservationRow(input())!;
    expect(leadHours(row)).toBeCloseTo(0.02, 2);
  });

  it("reports a stale forecast as the long-lead prediction it actually was", () => {
    const row = buildObservationRow(input({ fcIssued: "2026-09-21T11:00:00Z" }))!;
    expect(leadHours(row)).toBeCloseTo(6, 5);
  });

  it("says unknown rather than zero for a row written before the field existed", () => {
    const row = buildObservationRow(input({ fcIssued: undefined }))!;
    expect(row.fc.issued).toBeUndefined();
    expect(leadHours(row)).toBeNull();
  });
});
