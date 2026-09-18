import { isAngleInSector, normalizeDeg } from "./direction.ts";
import type { Sector } from "./siteFile.ts";
import type { RoseState } from "../components/WindRose/index.ts";

export type DirectionFit = "good" | "maybe" | "bad" | "unknown";
export type SpeedFit = "good" | "maybe" | "bad" | "unknown";

/**
 * Fallback marginal padding, used for one side of one range only when that
 * side authors no `margin_under_deg`/`margin_over_deg` of its own. It was
 * once applied uniformly to every site - the rule rather than the fallback -
 * and it stays exported at the same value so an unauthored side behaves
 * exactly as the whole catalogue behaved before margins existed.
 *
 * Originally: marginal padding applied uniformly on each side of a site's
 * single authoritative sector to compute a "maybe" direction zone (§ FlyWeather
 * Site Catalogue Migration - replaces the old hand-authored
 * rose.orange[] ranges). Every site in the pre-migration catalogue that
 * had rose data used exactly this ±11.25deg padding around its green
 * sector - verified empirically across all 24 such sites, zero exceptions
 * (see SITE_MIGRATION_REPORT.md) - so this constant reproduces identical
 * direction-fit behavior for every currently-known site while removing
 * the need to hand-author a redundant, always-derivable orange range per
 * site. A future site with a genuinely different marginal zone can still
 * be represented by widening/narrowing its own `sector` - this constant
 * is a product-wide default, not a hard physical law.
 */
export const MARGINAL_SECTOR_PADDING_DEG = 11.25;

/**
 * Direction result per MASTER_SPEC.md §5.2: inside any of the site's
 * sector ranges is good, within that range's own authored margin of its
 * edge is maybe, further outside every range is bad, and no sector
 * configured at all is unknown - never guess. Most sites have one range; a
 * site can have more (e.g. a winch strip launchable from either end) -
 * every range is checked independently, any match wins.
 *
 * Each side's margin is read from the range itself, falling back to
 * MARGINAL_SECTOR_PADDING_DEG when unauthored, so a site that says nothing
 * is judged exactly as the whole catalogue was judged before per-side
 * margins existed. An authored 0 is meaningfully different from an absent
 * margin: it says "this edge has no marginal zone, step outside and it is
 * a hard no", which is why these fields are optional rather than defaulted
 * at the schema.
 */
export function computeDirectionFit(windDirectionDeg: number | null, sector: Sector | null): DirectionFit {
  if (windDirectionDeg === null) return "unknown";
  if (sector === null) return "unknown";
  for (const range of sector.ranges) {
    if (isAngleInSector(windDirectionDeg, range.from_deg, range.to_deg)) return "good";
  }
  for (const range of sector.ranges) {
    const under = range.margin_under_deg ?? MARGINAL_SECTOR_PADDING_DEG;
    const over = range.margin_over_deg ?? MARGINAL_SECTOR_PADDING_DEG;
    const paddedFrom = normalizeDeg(range.from_deg - under);
    const paddedTo = normalizeDeg(range.to_deg + over);
    if (isAngleInSector(windDirectionDeg, paddedFrom, paddedTo)) return "maybe";
  }
  return "bad";
}

export interface WindConfig {
  verified: boolean;
  min_ms?: number;
  max_ms?: number;
  /** Absent means 0 - see siteFile.ts's windSchema for why that is the old behavior, not a default. */
  margin_under_ms?: number;
  margin_over_ms?: number;
  hard_max_gust_ms?: number;
}

/**
 * Speed result per MASTER_SPEC.md §5.3. Never treats an unverified config
 * as a real band - unverified always reads as "unknown", not silently
 * substituted with generic numbers.
 *
 * Three tiers, mirroring the direction axis: inside min_ms/max_ms is good,
 * inside an authored margin beyond either end is maybe, anything further
 * is bad. The middle tier is authored data, never a guessed constant - a
 * site that authors no margins has none, and one tenth of a m/s past
 * max_ms is still a hard no exactly as it was before margins existed.
 *
 * (§ FlyWeather Site Catalogue Migration had collapsed this to two tiers
 * because zero sites then had wind.verified=true, so no real site
 * exercised a marginal speed. Nine do now, and Klamby's real 5-6 m/s
 * orange had to live in prose for want of somewhere to put it.)
 *
 * A gust over hard_max_gust_ms stays bad even when the base speed lands in
 * a margin: a hard gust limit is a hard limit, and the marginal tier must
 * never be able to soften it.
 */
export function computeSpeedFit(windSpeedMs: number | null, windGustMs: number | null, wind: WindConfig): SpeedFit {
  if (!wind.verified || windSpeedMs === null) return "unknown";
  if (wind.hard_max_gust_ms !== undefined && windGustMs !== null && windGustMs > wind.hard_max_gust_ms) {
    return "bad";
  }
  if (wind.min_ms !== undefined && wind.max_ms !== undefined) {
    if (windSpeedMs >= wind.min_ms && windSpeedMs <= wind.max_ms) return "good";
    // Clamped at 0: a negative wind speed is meaningless, so an
    // over-generous margin_under_ms must not create a band below calm.
    const marginalMin = Math.max(0, wind.min_ms - (wind.margin_under_ms ?? 0));
    const marginalMax = wind.max_ms + (wind.margin_over_ms ?? 0);
    if (windSpeedMs >= marginalMin && windSpeedMs <= marginalMax) return "maybe";
  }
  return "bad";
}

/**
 * Overall rose state per MASTER_SPEC.md §5.4 / AGENTS.md's "never invent
 * production data" rule: direction is the critical criterion (unknown
 * direction -> gray, "no trustworthy data"); a bad direction is always
 * red regardless of speed; a good/maybe direction with unverified or bad
 * speed is orange only when speed is unknown (bad speed is still red);
 * only a good direction with a verified-good speed reaches green.
 */
export function computeOverallState(directionFit: DirectionFit, speedFit: SpeedFit): RoseState {
  if (directionFit === "unknown") return "gray";
  if (directionFit === "bad") return "red";
  if (speedFit === "bad") return "red";
  if (directionFit === "maybe" || speedFit === "maybe" || speedFit === "unknown") return "orange";
  return "green";
}

/** Human-readable reasons behind a fit combination, in the spirit of §5.4's structured-reasons example. */
export function explainFit(directionFit: DirectionFit, speedFit: SpeedFit): string[] {
  const reasons: string[] = [];
  switch (directionFit) {
    case "good":
      reasons.push("wind direction is inside the site's usable sector");
      break;
    case "maybe":
      reasons.push("wind direction is near the edge of the site's usable sector");
      break;
    case "bad":
      reasons.push("wind direction is outside the site's usable sector");
      break;
    case "unknown":
      reasons.push("no direction sector configured for this site, or no wind direction data");
      break;
  }
  switch (speedFit) {
    case "good":
      reasons.push("wind speed is inside the verified usable band");
      break;
    case "maybe":
      reasons.push("wind speed is just outside the usable band, inside the site's marginal allowance");
      break;
    case "bad":
      reasons.push("wind speed is outside verified safe limits");
      break;
    case "unknown":
      reasons.push("site speed limits are not yet verified");
      break;
  }
  return reasons;
}

export interface FlyabilityResult {
  directionFit: DirectionFit;
  speedFit: SpeedFit;
  state: RoseState;
  reasons: string[];
}

/** Convenience wrapper composing the direction/speed/overall/reasons functions above. */
export function evaluateFlyability(
  windDirectionDeg: number | null,
  windSpeedMs: number | null,
  windGustMs: number | null,
  sector: Sector | null,
  wind: WindConfig,
): FlyabilityResult {
  const directionFit = computeDirectionFit(windDirectionDeg, sector);
  const speedFit = computeSpeedFit(windSpeedMs, windGustMs, wind);
  const state = computeOverallState(directionFit, speedFit);
  const reasons = explainFit(directionFit, speedFit);
  return { directionFit, speedFit, state, reasons };
}
