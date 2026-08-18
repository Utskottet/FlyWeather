import { isAngleInSector } from "./direction.ts";
import type { Sector } from "./sites.ts";
import type { RoseState } from "../components/WindRose/index.ts";

export type DirectionFit = "good" | "maybe" | "bad" | "unknown";
export type SpeedFit = "good" | "maybe" | "bad" | "unknown";

/**
 * Direction result per MASTER_SPEC.md §5.2: inside a green sector is good,
 * inside orange is maybe, outside all sectors is bad, and no sector data
 * at all (nothing configured) is unknown - never guess.
 */
export function computeDirectionFit(
  windDirectionDeg: number | null,
  greenSectors: Sector[],
  orangeSectors: Sector[],
): DirectionFit {
  if (windDirectionDeg === null) return "unknown";
  if (greenSectors.length === 0 && orangeSectors.length === 0) return "unknown";
  if (greenSectors.some((s) => isAngleInSector(windDirectionDeg, s.from_deg, s.to_deg))) return "good";
  if (orangeSectors.some((s) => isAngleInSector(windDirectionDeg, s.from_deg, s.to_deg))) return "maybe";
  return "bad";
}

export interface WindSpeedConfig {
  verified: boolean;
  good_min_ms?: number;
  good_max_ms?: number;
  maybe_min_ms?: number;
  maybe_max_ms?: number;
  hard_max_gust_ms?: number;
}

/**
 * Speed result per MASTER_SPEC.md §5.3. Never treats an unverified config
 * as a real band - unverified always reads as "unknown", not silently
 * substituted with generic numbers.
 */
export function computeSpeedFit(
  windSpeedMs: number | null,
  windGustMs: number | null,
  windSpeed: WindSpeedConfig,
): SpeedFit {
  if (!windSpeed.verified || windSpeedMs === null) return "unknown";
  if (
    windSpeed.hard_max_gust_ms !== undefined &&
    windGustMs !== null &&
    windGustMs > windSpeed.hard_max_gust_ms
  ) {
    return "bad";
  }
  if (
    windSpeed.good_min_ms !== undefined &&
    windSpeed.good_max_ms !== undefined &&
    windSpeedMs >= windSpeed.good_min_ms &&
    windSpeedMs <= windSpeed.good_max_ms
  ) {
    return "good";
  }
  if (
    windSpeed.maybe_min_ms !== undefined &&
    windSpeed.maybe_max_ms !== undefined &&
    windSpeedMs >= windSpeed.maybe_min_ms &&
    windSpeedMs <= windSpeed.maybe_max_ms
  ) {
    return "maybe";
  }
  return "bad";
}

/**
 * Overall rose state per MASTER_SPEC.md §5.4 / AGENTS.md's "never invent
 * production data" rule: direction is the critical criterion (unknown
 * direction -> gray, "no trustworthy data"); a bad direction is always
 * red regardless of speed; a good/maybe direction with unverified or
 * marginal speed is orange (never silently promoted to green); only a
 * good direction with a verified-good speed reaches green.
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
      reasons.push("wind direction is inside the site's optimal sector");
      break;
    case "maybe":
      reasons.push("wind direction is inside the site's marginal sector");
      break;
    case "bad":
      reasons.push("wind direction is outside the site's usable sectors");
      break;
    case "unknown":
      reasons.push("no direction sectors configured for this site, or no wind direction data");
      break;
  }
  switch (speedFit) {
    case "good":
      reasons.push("wind speed is inside the verified good band");
      break;
    case "maybe":
      reasons.push("wind speed is inside the verified marginal band");
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
  greenSectors: Sector[],
  orangeSectors: Sector[],
  windSpeed: WindSpeedConfig,
): FlyabilityResult {
  const directionFit = computeDirectionFit(windDirectionDeg, greenSectors, orangeSectors);
  const speedFit = computeSpeedFit(windSpeedMs, windGustMs, windSpeed);
  const state = computeOverallState(directionFit, speedFit);
  const reasons = explainFit(directionFit, speedFit);
  return { directionFit, speedFit, state, reasons };
}
