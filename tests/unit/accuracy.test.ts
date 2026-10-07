import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCURACY_OPTIONS,
  angularDistanceDeg,
  angleDifferenceDeg,
  bandLabel,
  computeAccuracyStats,
  directionCutoffMs,
  leadLabel,
  referenceQuality,
  summariseSite,
  type AccuracySite,
} from "../../src/domain/accuracy.ts";
import type { ObservationRow } from "../../src/domain/observationLog.ts";

function row(
  over: Partial<{
    site: string;
    hour: string;
    obsMs: number;
    obsDeg: number | null;
    fcMs: number;
    fcDeg: number | null;
    fcGust: number | null;
    obsGust: number | null;
  }> = {},
): ObservationRow {
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
  station: { provider: "holfuy", stationId: "214", verified: true, distanceKm: 1 },
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

  it("buckets lead time into the table columns", () => {
    expect(leadLabel(0.5)).toBe("≤1h");
    expect(leadLabel(6.5)).toBe("≈6h");
    expect(leadLabel(12.5)).toBe("≈12h");
    expect(leadLabel(24.5)).toBe("≈24h");
    expect(leadLabel(48.5)).toBe("≈48h");
    expect(leadLabel(80)).toBe(">60h");
  });
});

describe("direction cutoff", () => {
  it("defaults to 3 m/s, and a verified higher minimum raises it", () => {
    expect(directionCutoffMs(site, DEFAULT_ACCURACY_OPTIONS)).toBe(3);
    expect(directionCutoffMs({ ...site, wind: { verified: true, min_ms: 6 } }, DEFAULT_ACCURACY_OPTIONS)).toBe(6);
    // An unverified minimum is not trusted to raise the floor.
    expect(directionCutoffMs({ ...site, wind: { verified: false, min_ms: 6 } }, DEFAULT_ACCURACY_OPTIONS)).toBe(3);
  });

  it("does not let light-wind direction drag the headline down", () => {
    // No authored minimum, so the floor is the only cutoff in play.
    const noFloor: AccuracySite = { ...site, wind: { verified: false } };
    const rows = [
      // 1 m/s: direction meaningless, wildly wrong - must not count.
      row({ hour: "2026-09-21T19:00Z", obsMs: 1, fcMs: 5, obsDeg: 0, fcDeg: 180 }),
      // 5 m/s: launchable and correct - the only hour in the headline.
      row({ hour: "2026-09-21T20:00Z", obsMs: 5, fcMs: 5, obsDeg: 225, fcDeg: 225 }),
    ];
    const s = computeAccuracyStats(rows, noFloor);
    expect(s.n).toBe(2);
    expect(s.directionN).toBe(1);
    expect(s.accuracyPct).toBe(100);
    // With no cutoff both hours count, and the light-wind miss halves it.
    const permissive = computeAccuracyStats(rows, noFloor, { ...DEFAULT_ACCURACY_OPTIONS, directionMinObsMs: 0 });
    expect(permissive.directionN).toBe(2);
    expect(permissive.accuracyPct).toBe(50);
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
    expect(s.days).toBe(1);
    expect(s.biasMs).toBe(1);
    expect(s.maeMs).toBe(1);
    expect(s.rmseMs).toBe(1);
    expect(s.medianAbsErrMs).toBe(1);
    expect(s.dirMaeDeg).toBe(0);
    expect(s.withinSpeedPct).toBe(100);
    expect(s.accuracyPct).toBe(100);
    expect(s.confident).toBe(false);
  });

  it("does not count a miss on either axis as a hit", () => {
    const rows = [
      row({ fcMs: 5, obsMs: 5, fcDeg: 225, obsDeg: 225 }),
      row({ fcMs: 9, obsMs: 5, fcDeg: 225, obsDeg: 225 }), // speed off by 4
      row({ fcMs: 5, obsMs: 5, fcDeg: 300, obsDeg: 225 }), // direction off by 75
    ];
    const s = computeAccuracyStats(rows, site);
    expect(s.n).toBe(3);
    expect(s.accuracyPct).toBe(33.3);
    expect(s.withinSpeedPct).toBe(66.7);
    expect(s.withinDirPct).toBe(66.7);
  });

  it("treats a wraparound direction as close, not far", () => {
    const rows = [row({ fcMs: 5, obsMs: 5, fcDeg: 5, obsDeg: 355 })];
    const s = computeAccuracyStats(rows, site);
    expect(s.dirMaeDeg).toBe(10);
    expect(s.withinDirPct).toBe(100);
  });

  it("reports a signed circular direction bias", () => {
    // Forecast always 20 degrees clockwise of the meter.
    const rows = [
      row({ fcMs: 5, obsMs: 5, fcDeg: 245, obsDeg: 225 }),
      row({ fcMs: 5, obsMs: 5, fcDeg: 45, obsDeg: 25 }),
    ];
    expect(computeAccuracyStats(rows, site).dirBiasDeg).toBe(20);
  });

  it("flags hours we called flyable while the meter was over the site's limit", () => {
    const rows = [
      row({ fcMs: 5, fcDeg: 225, obsMs: 9, obsDeg: 225 }),
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

describe("reference quality", () => {
  it("calls a close verified station good, and downgrades the rest", () => {
    expect(referenceQuality(site)).toBe("good");
    expect(referenceQuality({ ...site, station: { provider: "holfuy", stationId: "1", verified: false, distanceKm: 1 } })).toBe("provisional");
    expect(referenceQuality({ ...site, station: { provider: "holfuy", stationId: "1", verified: true, distanceKm: 20 } })).toBe("unusable");
    expect(referenceQuality({ ...site, station: null })).toBe("unusable");
  });

  it("downgrades a shared station to provisional, not unusable", () => {
    // The legitimate site should not be punished for the other's mistake.
    const dup = new Set(["holfuy:214"]);
    expect(referenceQuality(site, dup)).toBe("provisional");
  });

  it("hides the headline when there are too few launchable hours", () => {
    const calm = Array.from({ length: 50 }, () => row({ obsMs: 1, fcMs: 1 }));
    const s = computeAccuracyStats(calm, site);
    expect(s.directionN).toBe(0);
    expect(s.launchableConfident).toBe(false);
    expect(s.confident).toBe(false);
    // 50 calm hours is still real speed evidence, and is reported as such.
    expect(s.n).toBe(50);
  });
});

describe("summariseSite", () => {
  it("splits by wind band and says 'collecting' below the threshold", () => {
    const rows = [row({ obsMs: 1, fcMs: 1 }), row({ obsMs: 5, fcMs: 5 }), row({ obsMs: 8, fcMs: 8 })];
    const s = summariseSite(rows, site);
    expect(s.byBand.map((b) => b.label)).toEqual(["0–3", "3–6", "6–9"]);
    expect(s.note).toContain("Collecting");
    expect(s.overall.confident).toBe(false);
    expect(s.referenceQuality).toBe("good");
  });

  it("reports first-half vs second-half stability", () => {
    const rows = [
      row({ hour: "2026-09-21T19:00Z", obsMs: 5, fcMs: 5, obsDeg: 225, fcDeg: 225 }),
      row({ hour: "2026-09-21T20:00Z", obsMs: 5, fcMs: 5, obsDeg: 225, fcDeg: 225 }),
      row({ hour: "2026-09-21T21:00Z", obsMs: 5, fcMs: 5, obsDeg: 225, fcDeg: 0 }),
      row({ hour: "2026-09-21T22:00Z", obsMs: 5, fcMs: 5, obsDeg: 225, fcDeg: 0 }),
    ];
    const s = summariseSite(rows, site);
    expect(s.stability.firstHalfAccuracyPct).toBe(100);
    expect(s.stability.secondHalfAccuracyPct).toBe(0);
    expect(s.stability.deltaPct).toBe(-100);
  });

  it("never pretends to score a site with no station", () => {
    const s = summariseSite([], { ...site, station: null, hasStation: false });
    expect(s.note).toContain("No station");
    expect(s.referenceQuality).toBe("unusable");
    expect(s.overall.n).toBe(0);
    expect(s.overall.accuracyPct).toBeNull();
  });
});
