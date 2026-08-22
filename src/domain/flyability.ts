import { isAngleInSector, normalizeDeg } from "./direction.ts";
import type { Sector } from "./siteFile.ts";
import type { RoseState } from "../components/WindRose/index.ts";

export type DirectionFit = "good" | "maybe" | "bad" | "unknown";
export type SpeedFit = "good" | "bad" | "unknown";

/**
 * Marginal padding applied uniformly on each side of a site's single
 * authoritative sector to compute a "maybe" direction zone (§ FlyWeather
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
 * Direction result per MASTER_SPEC.md §5.2: inside the sector is good,
 * within MARGINAL_SECTOR_PADDING_DEG of either edge is maybe, further
 * outside is bad, and no sector configured at all is unknown - never
 * guess.
 */
export function computeDirectionFit(windDirectionDeg: number | null, sector: Sector | null): DirectionFit {
  if (windDirectionDeg === null) return "unknown";
  if (sector === null) return "unknown";
  if (isAngleInSector(windDirectionDeg, sector.from_deg, sector.to_deg)) return "good";
  const paddedFrom = normalizeDeg(sector.from_deg - MARGINAL_SECTOR_PADDING_DEG);
  const paddedTo = normalizeDeg(sector.to_deg + MARGINAL_SECTOR_PADDING_DEG);
  if (isAngleInSector(windDirectionDeg, paddedFrom, paddedTo)) return "maybe";
  return "bad";
}

export interface WindConfig {
  verified: boolean;
  min_ms?: number;
  max_ms?: number;
  hard_max_gust_ms?: number;
}

/**
 * Speed result per MASTER_SPEC.md §5.3. Never treats an unverified config
 * as a real band - unverified always reads as "unknown", not silently
 * substituted with generic numbers. Simplified to a single usable band
 * (§ FlyWeather Site Catalogue Migration replaced the old good/maybe
 * four-number band with one min_ms/max_ms pair) - safe because zero sites
 * in the pre-migration catalogue had wind_speed.verified=true, so no real
 * site ever exercised the old "maybe" speed tier in production.
 */
export function computeSpeedFit(windSpeedMs: number | null, windGustMs: number | null, wind: WindConfig): SpeedFit {
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
  if (directionFit === "maybe" || speedFit === "unknown") return "orange";
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
