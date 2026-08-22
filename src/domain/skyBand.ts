import { getTimes } from "suncalc";

export interface GeoCoordinate {
  lat: number;
  lon: number;
}

/**
 * Representative South Sweden coordinate (central Skåne), per the task's
 * own spec. Deliberately kept as a plain named constant, not baked into
 * `classifySkyBand`/`buildSkyBandBlocks` themselves (both take a location
 * parameter) - a future GPS position or a selected flying site's own
 * coordinates is a call-site change, not a rewrite of this module.
 */
export const SOUTH_SWEDEN_REPRESENTATIVE_LOCATION: GeoCoordinate = { lat: 55.8, lon: 13.3 };

/**
 * Visual cue only - NOT a real civil/nautical twilight calculation. Chosen
 * at the narrower end of a reasonable 30-45 minute range so the orange band
 * reads as a crisp transition rather than a washy gradient, per the task's
 * own guidance.
 */
export const SKY_BAND_TRANSITION_MINUTES = 30;

export type SkyBandPhase = "night" | "transition" | "day";

const PHASE_COLORS: Record<SkyBandPhase, string> = {
  night: "#1a2456", // deep blue
  transition: "#e8912a", // orange
  day: "#bfe3fb", // light blue
};

function sunriseSunsetForDay(date: Date, location: GeoCoordinate): { sunrise: number; sunset: number } {
  // SunCalc computes purely astronomically from the Date's own epoch
  // instant + lat/lon - no dependency on the system/local timezone, so
  // this is DST-safe by construction (never does its own +1/+2 arithmetic).
  const times = getTimes(date, location.lat, location.lon);
  // suncalc types sunrise/sunset as nullable to cover polar day/night
  // (no sunrise/sunset at all on some days above ~66.5° latitude) - not
  // reachable for the documented South-Sweden coordinate (55.8°N, well
  // south of the Arctic Circle) or any other latitude this app is meant
  // to run at, so a null here means a real configuration mistake
  // (someone passed a polar location in) - fail loudly, don't silently
  // coerce or guess a fallback time.
  if (times.sunrise === null || times.sunset === null) {
    throw new Error(
      `No real sunrise/sunset for ${date.toISOString()} at ${location.lat},${location.lon} - ` +
        "this location is likely inside the polar day/night zone, which this module doesn't support.",
    );
  }
  return { sunrise: times.sunrise.getTime(), sunset: times.sunset.getTime() };
}

/** The real sky phase at a given UTC instant, relative to that calendar
 * day's actual astronomically-computed sunrise/sunset at `location`. */
export function classifySkyBand(instant: Date, location: GeoCoordinate): SkyBandPhase {
  const { sunrise, sunset } = sunriseSunsetForDay(instant, location);
  const transitionMs = SKY_BAND_TRANSITION_MINUTES * 60_000;
  const t = instant.getTime();

  if (t >= sunrise - transitionMs && t < sunrise + transitionMs) return "transition";
  if (t >= sunset - transitionMs && t < sunset + transitionMs) return "transition";
  if (t >= sunrise + transitionMs && t < sunset - transitionMs) return "day";
  return "night";
}

export interface SkyBandBlock {
  phase: SkyBandPhase;
  startPercent: number; // 0..100, position along `hours`
  endPercent: number;
}

/**
 * Builds hard-edged color blocks spanning `hours` (ascending ISO-UTC) - not
 * a smoothly-sampled approximation. Sunrise/sunset transition boundaries
 * are computed exactly (astronomically, per real calendar day touched by
 * the range, plus a day of margin on each side so a transition whose
 * window straddles the range's own start/end is still captured correctly),
 * then the whole range is filled between those boundaries - correctly
 * handles a sunrise before the range starts or a sunset after it ends
 * (the block touching that edge is classified by its own midpoint, not
 * assumed), and multi-day overnight spans (adjacent night blocks across a
 * day boundary are merged into one continuous block, not left as
 * artificially separate segments).
 */
export function buildSkyBandBlocks(hours: string[], location: GeoCoordinate): SkyBandBlock[] {
  if (hours.length < 2) return [];
  const start = new Date(hours[0]).getTime();
  const end = new Date(hours[hours.length - 1]).getTime();
  const span = end - start;
  if (!(span > 0)) return [];

  const transitionMs = SKY_BAND_TRANSITION_MINUTES * 60_000;
  const oneDayMs = 24 * 60 * 60_000;
  const boundaries = new Set<number>([start, end]);

  for (let dayStart = start - oneDayMs; dayStart <= end + oneDayMs; dayStart += oneDayMs) {
    const { sunrise, sunset } = sunriseSunsetForDay(new Date(dayStart), location);
    for (const eventMs of [sunrise, sunset]) {
      for (const boundary of [eventMs - transitionMs, eventMs + transitionMs]) {
        if (boundary > start && boundary < end) boundaries.add(boundary);
      }
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const blocks: SkyBandBlock[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const midpoint = (sorted[i] + sorted[i + 1]) / 2;
    const phase = classifySkyBand(new Date(midpoint), location);
    const startPercent = ((sorted[i] - start) / span) * 100;
    const endPercent = ((sorted[i + 1] - start) / span) * 100;
    const last = blocks[blocks.length - 1];
    if (last && last.phase === phase) {
      last.endPercent = endPercent;
    } else {
      blocks.push({ phase, startPercent, endPercent });
    }
  }
  return blocks;
}

/** CSS `background` value from buildSkyBandBlocks's output - hard edges at
 * each block boundary (same color repeated at two adjacent stop positions),
 * not a smooth cross-fade, matching the task's "orange band, not a
 * gradient wash" intent. */
export function skyBandCssGradient(blocks: SkyBandBlock[]): string {
  if (blocks.length === 0) return "transparent";
  const stops = blocks.flatMap((b) => [
    `${PHASE_COLORS[b.phase]} ${b.startPercent}%`,
    `${PHASE_COLORS[b.phase]} ${b.endPercent}%`,
  ]);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
