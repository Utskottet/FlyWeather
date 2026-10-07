import { describe, expect, it } from "vitest";
import {
  appendLeadRecords,
  buildLeadRecord,
  joinLeadPairs,
  leadBucket,
  leadRecordKey,
  parseLeadForecasts,
  recordedLeadKeys,
  LEAD_BUCKET_ORDER,
  type LeadForecastRecord,
} from "../../src/domain/leadForecast.ts";
import type { ObservationRow } from "../../src/domain/observationLog.ts";

const ISSUED = "2026-10-01T12:00:00.000Z";

function lead(over: Partial<LeadForecastRecord> = {}): LeadForecastRecord {
  return {
    at: ISSUED,
    site: "hammar",
    target: "2026-10-02T12:00Z",
    leadHours: 24,
    issued: ISSUED,
    ms: 6,
    deg: 225,
    gust: 9,
    ...over,
  };
}

function observation(hour: string, ms = 5): ObservationRow {
  return {
    at: hour,
    site: "hammar",
    hour,
    obs: { ms, deg: 225, gust: null, src: "holfuy", ageConfirmed: true },
    fc: { ms, deg: 225, gust: null, issued: hour },
  };
}

describe("lead buckets", () => {
  it("maps a real lead to its table column, tolerating the half-hour offset", () => {
    expect(leadBucket(0.5)).toBe("≤1h");
    expect(leadBucket(6.5)).toBe("≈6h");
    expect(leadBucket(12.5)).toBe("≈12h");
    expect(leadBucket(24.5)).toBe("≈24h");
    expect(leadBucket(48.5)).toBe("≈48h");
    expect(leadBucket(72)).toBe(">60h");
    expect(LEAD_BUCKET_ORDER).toHaveLength(6);
  });
});

describe("buildLeadRecord", () => {
  it("computes the real lead from target minus issue time", () => {
    const r = buildLeadRecord({ at: ISSUED, site: "hammar", target: "2026-10-02T12:00Z", issued: ISSUED, ms: 6, deg: 225, gust: 9 });
    expect(r?.leadHours).toBe(24);
    expect(r?.target).toBe("2026-10-02T12:00Z");
  });

  it("refuses a forecast for an hour in the past, and one with no speed", () => {
    const past = buildLeadRecord({ at: ISSUED, site: "hammar", target: "2026-10-01T06:00Z", issued: ISSUED, ms: 6, deg: 225, gust: 9 });
    expect(past).toBeNull();
    const noSpeed = buildLeadRecord({ at: ISSUED, site: "hammar", target: "2026-10-02T12:00Z", issued: ISSUED, ms: null, deg: null, gust: null });
    expect(noSpeed).toBeNull();
  });
});

describe("serialise / parse / dedupe", () => {
  it("round-trips and keeps only one prediction per (site, target, column)", () => {
    const text = appendLeadRecords("", [lead(), lead()]);
    const rows = parseLeadForecasts(text);
    expect(rows).toHaveLength(2);
    // Two runs inside the same column for the same hour count once.
    expect(recordedLeadKeys(rows).size).toBe(1);
    expect(leadRecordKey(rows[0])).toBe("hammar@2026-10-02T12:00Z@≈24h");
  });

  it("skips bad lines rather than losing the file", () => {
    const text = `${JSON.stringify(lead())}\nnot json\n{"site":"x"}\n`;
    expect(parseLeadForecasts(text)).toHaveLength(1);
  });
});

describe("joinLeadPairs", () => {
  it("pairs a recorded forecast with the observation for its target hour", () => {
    const obs = [observation("2026-10-02T12:00Z", 5)];
    const pairs = joinLeadPairs(obs, [lead({ ms: 6 })]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].obs.ms).toBe(5);
    expect(pairs[0].fc.ms).toBe(6);
    expect(pairs[0].fc.issued).toBe(ISSUED);
    // The synthetic row's lead is recoverable from its issue time.
    expect((Date.parse(pairs[0].hour) - Date.parse(pairs[0].fc.issued!)) / 3_600_000).toBe(24);
  });

  it("produces nothing for an hour that has not happened yet", () => {
    const pairs = joinLeadPairs([observation("2026-10-01T12:00Z")], [lead()]);
    expect(pairs).toHaveLength(0);
  });
});
