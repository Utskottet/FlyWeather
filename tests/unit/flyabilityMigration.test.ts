import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../../scripts/build-sites-catalogue.ts";
import { computeDirectionFit, computeOverallState, computeSpeedFit } from "../../src/domain/flyability.ts";
import { isAngleInSector, normalizeDeg } from "../../src/domain/direction.ts";
import type { Sector } from "../../src/domain/siteFile.ts";
import type { Site } from "../../src/domain/sites.ts";
import type { RoseState } from "../../src/components/WindRose/index.ts";

/**
 * Equivalence guard for the per-side margin migration.
 *
 * The migration's promise was that the map keeps looking exactly as it
 * looked before - only the thing computing each rose's colour moves from a
 * hard-coded constant into authored per-site data. This sweeps every real
 * site across every wind direction and a realistic speed range and asserts
 * the new three-tier logic produces the identical rose colour the old
 * two-tier logic produced.
 *
 * The frozen copies below are the pre-migration implementations verbatim
 * (git show eae97a7:src/domain/flyability.ts). They are duplicated on
 * purpose rather than imported: their job is to stay behind while the real
 * ones move, so this test can never quietly follow a regression.
 */

const LEGACY_PADDING_DEG = 11.25;

type LegacyDirectionFit = "good" | "maybe" | "bad" | "unknown";
type LegacySpeedFit = "good" | "bad" | "unknown";

interface LegacyWindConfig {
  verified: boolean;
  min_ms?: number;
  max_ms?: number;
  hard_max_gust_ms?: number;
}

function legacyDirectionFit(windDirectionDeg: number | null, sector: Sector | null): LegacyDirectionFit {
  if (windDirectionDeg === null) return "unknown";
  if (sector === null) return "unknown";
  for (const range of sector.ranges) {
    if (isAngleInSector(windDirectionDeg, range.from_deg, range.to_deg)) return "good";
  }
  for (const range of sector.ranges) {
    const paddedFrom = normalizeDeg(range.from_deg - LEGACY_PADDING_DEG);
    const paddedTo = normalizeDeg(range.to_deg + LEGACY_PADDING_DEG);
    if (isAngleInSector(windDirectionDeg, paddedFrom, paddedTo)) return "maybe";
  }
  return "bad";
}

function legacySpeedFit(
  windSpeedMs: number | null,
  windGustMs: number | null,
  wind: LegacyWindConfig,
): LegacySpeedFit {
  if (!wind.verified || windSpeedMs === null) return "unknown";
  if (wind.hard_max_gust_ms !== undefined && windGustMs !== null && windGustMs > wind.hard_max_gust_ms) {
    return "bad";
  }
  if (
    wind.min_ms !== undefined &&
    wind.max_ms !== undefined &&
    windSpeedMs >= wind.min_ms &&
    windSpeedMs <= wind.max_ms
  ) {
    return "good";
  }
  return "bad";
}

function legacyOverallState(directionFit: LegacyDirectionFit, speedFit: LegacySpeedFit): RoseState {
  if (directionFit === "unknown") return "gray";
  if (directionFit === "bad") return "red";
  if (speedFit === "bad") return "red";
  if (directionFit === "maybe" || speedFit === "unknown") return "orange";
  return "green";
}

/**
 * Whether a site still expresses exactly the old, pre-margin rule:
 * MARGINAL_SECTOR_PADDING_DEG on both sides of every range, and no speed
 * margin at all. Such a site MUST render identically - that was the
 * migration's whole promise.
 *
 * Derived from the data rather than kept as a hard-coded list of
 * exceptions, so that authoring a real margin - which is the entire point
 * of the feature, and now happens through the in-app site editor - does
 * not mean editing this test to keep the suite green. A site that authors
 * something different has knowingly opted out of the old rule; every site
 * that has not stays covered, indefinitely.
 */
function stillUsesLegacyRule(site: Site): boolean {
  const speedUnchanged = !site.wind.margin_under_ms && !site.wind.margin_over_ms;
  const directionUnchanged = (site.sector?.ranges ?? []).every(
    (r) =>
      (r.margin_under_deg ?? LEGACY_PADDING_DEG) === LEGACY_PADDING_DEG &&
      (r.margin_over_deg ?? LEGACY_PADDING_DEG) === LEGACY_PADDING_DEG,
  );
  return speedUnchanged && directionUnchanged;
}

const SPEEDS_MS = Array.from({ length: 41 }, (_, i) => i * 0.5); // 0 .. 20 m/s

describe("per-side margins leave every site that authors none rendering unchanged", () => {
  const catalogue = buildCatalogue();

  it("has actually loaded the real catalogue", () => {
    expect(catalogue.sites.length).toBeGreaterThanOrEqual(30);
  });

  for (const site of catalogue.sites) {
    const legacy = stillUsesLegacyRule(site);
    const title = legacy
      ? `${site.id} renders identically across every direction and speed`
      : `${site.id} authors its own margins, so only its marginal tier may differ`;

    it(title, () => {
      const sector = site.sector ?? null;
      const mismatches: string[] = [];

      for (let deg = 0; deg < 360; deg++) {
        for (const speedMs of SPEEDS_MS) {
          const before = legacyOverallState(
            legacyDirectionFit(deg, sector),
            legacySpeedFit(speedMs, null, site.wind),
          );
          const after = computeOverallState(
            computeDirectionFit(deg, sector),
            computeSpeedFit(speedMs, null, site.wind),
          );
          if (before !== after) {
            mismatches.push(`${deg}deg @ ${speedMs}m/s: was ${before}, now ${after}`);
          }
        }
      }

      if (!legacy) {
        // Authored margins are a deliberate statement about this site, so
        // comparing them against the old constant proves nothing: a WIDER
        // margin turns red into orange, a 0 margin turns orange into red,
        // and both are the feature working exactly as intended.
        //
        // What must still hold is that GREEN never moves. A margin only
        // ever describes the zone OUTSIDE the core - direction "good" means
        // inside a range, speed "good" means inside min_ms/max_ms, and
        // neither reads a margin at all. So a margin that created or
        // destroyed a green verdict would mean margins are leaking into the
        // core, which is a bug however deliberate the authoring was.
        const greenMoved = mismatches.filter((m) => m.includes("green"));
        expect(greenMoved.slice(0, 5).join("\n"), `${site.id}: a margin changed a GREEN verdict`).toBe("");
        return;
      }

      expect(mismatches.slice(0, 5).join("\n"), `${site.id} changed colour in ${mismatches.length} case(s)`).toBe(
        "",
      );
    });
  }
});
