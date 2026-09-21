import { getTimes } from "suncalc";
import { forecastHourMs } from "./forecastTime.ts";

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

/**
 * Deliberately quiet, and deliberately not three equal colours.
 *
 * This used to paint deep blue / orange / light blue in full strength,
 * which made the busiest band on screen out of information you only need
 * peripherally - the reference design has no colour bar here at all. Day
 * is now simply absent, so the strip marks the nights and says nothing the
 * rest of the time, and the twilight step is a soft neutral rather than a
 * saturated orange stripe between them.
 *
 * Translucent rather than solid so the strip sits *under* the tick marks
 * instead of competing with them.
 */
const PHASE_COLORS: Record<SkyBandPhase, string> = {
  night: "rgba(32, 42, 64, 0.55)",
  transition: "rgba(120, 132, 152, 0.26)",
  day: "transparent",
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

/**
 * True only in the real "night" phase (not "transition"/twilight) at the
 * given instant and location - used to swap a site marker's Sun for a
 * Moon (WeatherGlyph's `isNight`). Defaults to the real current instant
 * when `instantIso` is null (no forecast hour selected yet).
 */
export function isNightAt(instantIso: string | null, location: GeoCoordinate): boolean {
  const instant = instantIso ? new Date(instantIso) : new Date();
  return classifySkyBand(instant, location) === "night";
}

/**
 * How long the rose takes to fade to black after sunset, and to come back
 * before sunrise.
 *
 * Deliberately NOT the same constant as SKY_BAND_TRANSITION_MINUTES above.
 * That one is a visual cue on the time slider - "roughly twilight",
 * narrowed to read as a crisp band. This one stands for how long a site
 * stays usable after the sun goes down, which is a flying judgement rather
 * than a drawing choice. They are 30 and 40 today and either can move
 * without dragging the other with it.
 */
export const DAYLIGHT_FADE_MINUTES = 40;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * How lit a site is at an instant: 1 in full daylight, 0 in full darkness,
 * and a linear ramp across DAYLIGHT_FADE_MINUTES either side of night.
 *
 * Daylight is exactly "between this location's sunrise and sunset" - the
 * fade starts AT sunset, not before it, so nothing whatsoever changes
 * while the sun is up. Symmetrically, the rose is fully lit again by
 * sunrise, having started to recover DAYLIGHT_FADE_MINUTES earlier.
 *
 * The two ramps are combined with max() rather than handled as separate
 * cases, which is what keeps a short summer night honest: when sunset+40
 * would fall after sunrise-40, the windows overlap and the site simply
 * never reaches full black, exactly as it never really gets dark.
 */
export function daylightFactor(
  instant: Date,
  location: GeoCoordinate,
  fadeMinutes: number = DAYLIGHT_FADE_MINUTES,
): number {
  const t = instant.getTime();
  const oneDayMs = 24 * 60 * 60_000;

  // Yesterday, today and tomorrow, because the instant may sit either side
  // of UTC midnight relative to the events that bracket it.
  const days = [-1, 0, 1].map((offset) => sunriseSunsetForDay(new Date(t + offset * oneDayMs), location));

  if (days.some((d) => t >= d.sunrise && t < d.sunset)) return 1;

  const fadeMs = Math.max(1, fadeMinutes * 60_000);
  const sunsetsBefore = days.map((d) => d.sunset).filter((ms) => ms <= t);
  const sunrisesAfter = days.map((d) => d.sunrise).filter((ms) => ms >= t);

  const sinceSunset = sunsetsBefore.length > 0 ? t - Math.max(...sunsetsBefore) : Infinity;
  const untilSunrise = sunrisesAfter.length > 0 ? Math.min(...sunrisesAfter) - t : Infinity;

  return Math.max(clamp01(1 - sinceSunset / fadeMs), clamp01(1 - untilSunrise / fadeMs));
}

/**
 * How dark a rose is allowed to get. Below this it stops being a marker.
 *
 * The fade originally bottomed out at pure black, which is what the brief
 * asked for and what it does physically - but on the pale map the result
 * was a night map whose site markers were the hardest thing on it to see,
 * which is precisely when a pilot is looking. Night is still unmistakably
 * night; it is just still a readable marker.
 *
 * Applied here rather than in daylightFactor because the factor is a
 * physical quantity - how lit the site actually is - and should stay
 * honest at 0. This is a drawing decision about legibility, so it belongs
 * with the drawing.
 */
const NIGHT_FLOOR = 0.32;

/**
 * The same colour, dimmed toward black by a daylight factor. Multiplying
 * each channel keeps the hue and just drains the light out of it, so a
 * half-dark green still reads as green rather than as some other colour -
 * the wind verdict stays legible right up until it is genuinely too dark
 * to fly.
 */
export function dimForDaylight(hexColor: string, factor: number): string {
  const f = NIGHT_FLOOR + clamp01(factor) * (1 - NIGHT_FLOOR);
  if (f >= 1) return hexColor;
  const hex = hexColor.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const channels = [0, 2, 4].map((i) => Math.round(parseInt(full.slice(i, i + 2), 16) * f));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
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
  const start = forecastHourMs(hours[0]);
  const end = forecastHourMs(hours[hours.length - 1]);
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
