import type { SiteDraftInput } from "./siteDraft";

type Wind = SiteDraftInput["wind"];

/**
 * Three-tier speed result, the speed-axis counterpart to the sector
 * bands' green core + authored orange margins.
 *
 * Production's own `../../../src/domain/flyability.ts` only has two real
 * tiers on the speed axis today (`SpeedFit` = good | bad | unknown):
 * inside the verified band is good, anything else is bad, and there is no
 * way to say "getting strong but still flyable". This adds that middle
 * tier as authored data rather than a guessed constant.
 */
export type SpeedTier = "green" | "orange" | "red" | "unknown";

/** The numeric boundaries a wind config implies, once margins are applied. */
export interface SpeedBoundaries {
  /** Green core, exactly as authored. */
  greenMin: number;
  greenMax: number;
  /** Orange floor - clamped at 0, since a negative wind speed is meaningless. */
  orangeMin: number;
  /** Orange ceiling. Equals greenMax when no over-margin is authored. */
  orangeMax: number;
}

/**
 * Null when the core band isn't fully authored yet - margins alone can
 * never define a band, and a half-filled form must read as "unknown"
 * rather than silently inventing limits (AGENTS.md: never invent
 * production data).
 */
export function speedBoundaries(wind: Wind): SpeedBoundaries | null {
  if (wind.min_ms === undefined || wind.max_ms === undefined) return null;
  return {
    greenMin: wind.min_ms,
    greenMax: wind.max_ms,
    orangeMin: Math.max(0, wind.min_ms - (wind.margin_under_ms ?? 0)),
    orangeMax: wind.max_ms + (wind.margin_over_ms ?? 0),
  };
}

/**
 * Which tier a given wind speed falls in. Boundaries are inclusive on the
 * green core (a site authored 5-7 treats exactly 7.0 as green, not
 * orange) and inclusive at the outer orange edge, so a 5-7 core with
 * margin_over_ms 2 reads 8.5 as orange, 9.0 as orange, and 9.1 as red.
 */
export function speedTier(windSpeedMs: number | null, wind: Wind): SpeedTier {
  const b = speedBoundaries(wind);
  if (b === null || windSpeedMs === null) return "unknown";
  if (windSpeedMs >= b.greenMin && windSpeedMs <= b.greenMax) return "green";
  if (windSpeedMs >= b.orangeMin && windSpeedMs <= b.orangeMax) return "orange";
  return "red";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * One-line plain-language summary of what the authored numbers mean, for
 * the editor to show back while you type. Reads the numbers out rather
 * than restating the labels, so a mistyped margin is obvious immediately
 * instead of at the next site visit.
 */
export function describeSpeedBands(wind: Wind): string {
  const b = speedBoundaries(wind);
  if (b === null) return "Set both min and max to define the green band.";

  const parts = [`green ${fmt(b.greenMin)}-${fmt(b.greenMax)} m/s`];
  const oranges: string[] = [];
  if (b.orangeMin < b.greenMin) oranges.push(`${fmt(b.orangeMin)}-${fmt(b.greenMin)}`);
  if (b.orangeMax > b.greenMax) oranges.push(`${fmt(b.greenMax)}-${fmt(b.orangeMax)}`);
  parts.push(oranges.length ? `orange ${oranges.join(" and ")} m/s` : "no orange margin");
  parts.push(`red below ${fmt(b.orangeMin)} and above ${fmt(b.orangeMax)} m/s`);
  return parts.join(" · ");
}
