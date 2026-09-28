import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCURACY_OPTIONS,
  angularDistanceDeg,
  angleDifferenceDeg,
  bandLabel,
  computeAccuracyStats,
  leadLabel,
  summariseSite,
  type AccuracySite,
} from "../../src/domain/accuracy.ts";
import type { ObservationRow } from "../../src/domain/observationLog.ts";

function row(over: Partial<{ site: string; hour: string; obsMs: number; obsDeg: number | null; fcMs: number; fcDeg: number | null; fcGust: number | null; obsGust: number | null }> = {}): ObservationRow {
  return {
    at: "2026-09-21T19:00:00.000Z",
    site: over.site ?? "hammar",
    hour: over.hour ?? "2026-09-21T19:00Z",
    obs: {
      ms: over.obsMs ?? 5,
      deg: over.obsDeg === undefined ? 225 : over.obsDeg,
      gust: over.obsGust ?? null,
      src: "holfuy",
      ageConfirmed: true,
    },
    fc: {
      ms: over.fcMs ?? 5,
      deg: over.fcDeg === undefined ? 225 : over.fcDeg,
      gust: over.fcGust ?? null,
    },
  };
}

const site: AccuracySite = {
  id: "hammar",
  name: "Hammars backar",
  sector: { ranges: [{ from_deg: 180, to_deg: 270 }], verified: true },
  wind: { verified: true, min_ms: 3, max_ms: 7 },
  hasStation: true,
};

describe("circular direction arithmetic", () => {
  it("measures the short way around north, never by subtraction", () => {
    expect(angularDistanceDeg(350, 10)).toBe(20);
    expect(angularDistanceDeg(10, 350)).toBe(20);
    expect(angularDistanceDeg(5, 355)).toBe(10);
    expect(angleDifferenceDeg(350, 10)).toBe(-20);
    expect(angleDifferenceDeg(10, 350)).toBe(20);
  });
});

describe("strata labels", () => {
  it("buckets observed wind into the configured bands", () => {
    const edges = [3, 6, 9];
    expect(bandLabel(1, edges)).toBe("0–3");
    expect(bandLabel(5, edges)).toBe("3–6");
    expect(bandLabel(7, edges)).toBe("6–9");
    expect(bandLabel(12, edges)).toBe("9+");
  });

  it("buckets lead time, and keeps unknown honest", () => {
    expect(leadLabel(null)).toBe("unknown");
    expect(leadLabel(0.5)).toBe("nowcast (≤1h)");
    expect(leadLabel(3)).toBe("1–6h");
    expect(leadLabel(10)).toBe("6–24h");
    expect(leadLabel(30)).toBe(">24h");
  });
});

describe("computeAccuracyStats", () => {
  it("computes bias, error and hit rate over complete pairs", () => {
    const rows = [
      row({ fcMs: 3, obsMs: 2 }),
      row({ fcMs: 5, obsMs: 4 }),
      row({ fcMs: 7, obsMs: 6 }),
      row({ fcMs: 9, obsMs: 8 }),
    ];
    const s = computeAccuracyStats(rows, site);
    expect(s.n).toBe(4);
    expect(s.biasMs).toBe(1);
    expect(s.maeMs).toBe(1);
    expect(s.rmseMs).toBe(1);
    expect(s.dirMaeDeg).toBe(0);
    expect(s.withinSpeedPct).toBe(100);
    expect(s.accuracyPct).toBe(100);
    // Four hours is never "confident".
    expect(s.confident).toBe(false);
  });

  it("does not count a miss on either axis as a hit", () => {
    const rows = [
      row({ fcMs: 5, obsMs: 5, fcDeg: 225, obsDeg: 225 }),
      row({ fcMs: 9, obsMs: 5, fcDeg: 225, obsDeg: 225 }), // speed off by 4
      row({ fcMs: 5, obsMs: 5, fcDeg: 300, obsDeg: 225 }), // direction off by 75
    ];
    const s = computeAccuracyStats(rows, site, { ...DEFAULT_ACCURACY_OPTIONS, speedToleranceMs: 2, directionToleranceDeg: 30 });
    expect(s.n).toBe(3);
    expect(s.accuracyPct).toBe(33.3);
    expect(s.withinSpeedPct).toBe(66.7);
    expect(s.withinDirPct).toBe(66.7);
  });

  it("treats a wraparound direction as close, not far", () => {
    const rows = [row({ fcMs: 5, obsMs: 5, fcDeg: 5, obsDeg: 355 })];
    const s = computeAccuracyStats(rows, site, { ...DEFAULT_ACCURACY_OPTIONS, directionToleranceDeg: 30 });
    expect(s.dirMaeDeg).toBe(10);
    expect(s.withinDirPct).toBe(100);
  });

  it("flags hours we called flyable while the meter was over the site's limit", () => {
    const rows = [
      // We say a good 5 m/s in-sector; the meter says 9 m/s, over this site's max of 7.
      row({ fcMs: 5, fcDeg: 225, obsMs: 9, obsDeg: 225 }),
      // We say flyable; the meter says too light. Optimistic, but not a safety failure.
      row({ fcMs: 5, fcDeg: 225, obsMs: 1, obsDeg: 225 }),
    ];
    const s = computeAccuracyStats(rows, site);
    expect(s.optimisticHours).toBe(2);
    expect(s.falseGreenOverLimitHours).toBe(1);
  });

  it("is confident only once the sample is large enough", () => {
    const many = Array.from({ length: DEFAULT_ACCURACY_OPTIONS.minSample }, () => row());
    expect(computeAccuracyStats(many, site).confident).toBe(true);
    expect(computeAccuracyStats(many.slice(0, -1), site).confident).toBe(false);
  });
});

describe("summariseSite", () => {
  it("splits by wind band and says 'collecting' below the threshold", () => {
    const rows = [
      row({ obsMs: 1, fcMs: 1 }),
      row({ obsMs: 5, fcMs: 5 }),
      row({ obsMs: 8, fcMs: 8 }),
    ];
    const s = summariseSite(rows, site);
    expect(s.byBand.map((b) => b.label)).toEqual(["0–3", "3–6", "6–9"]);
    expect(s.note).toContain("Collecting");
    expect(s.overall.confident).toBe(false);
  });

  it("never pretends to score a site with no station", () => {
    const s = summariseSite([], { ...site, hasStation: false });
    expect(s.note).toContain("No station");
    expect(s.overall.n).toBe(0);
    expect(s.overall.accuracyPct).toBeNull();
  });
});
