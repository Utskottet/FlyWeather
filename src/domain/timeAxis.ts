/**
 * NOW + this many hourly steps - shared by useSiteForecasts.ts and
 * useWindGrid.ts (previously duplicated in both), per MASTER_SPEC.md §6.
 * Comfortably covers DMI HARMONIE DINI's real ~60h forecast horizon (see
 * FlyWeather-Soaring's PROGRESS.md) - RASP's own validTimes array is
 * whatever's actually available and shorter than this window is handled
 * gracefully already (findNearestValidTime returns null past its horizon,
 * shown as "unavailable", never a stale/fake hour).
 */
export const SLIDER_STEPS = 72;

const STOCKHOLM_TZ = "Europe/Stockholm";

function stockholmHour(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(date);
}

function stockholmWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STOCKHOLM_TZ, weekday: "short" }).format(date).toUpperCase();
}

/** Title-case weekday ("Sat") for the thumb marker - the rail's own tick labels stay upper-case. */
function stockholmWeekdayTitle(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STOCKHOLM_TZ, weekday: "short" }).format(date);
}

function stockholmClock(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * The label carried by the timeline's draggable marker.
 *
 * Always states **both the day and the clock time** ("Sat 14:00"), at
 * every position including NOW - a bare hour ("17") made you work out
 * which day you were looking at from the tick rail underneath, and a bare
 * "NOW" hid the actual time you were about to fly at. NOW keeps its word
 * because live-vs-forecast is the more important distinction, but it no
 * longer costs you the timestamp.
 */
export function formatSliderLabel(date: Date, isNow: boolean): string {
  const stamp = `${stockholmWeekdayTitle(date)} ${stockholmClock(date)}`;
  if (isNow) return `NOW · ${stamp}`;
  return stamp;
}

/** Index of the first hour >= now in an ascending ISO-UTC hours array. */
export function findNowIndex(hours: string[], now: Date): number {
  const nowTime = now.getTime();
  const index = hours.findIndex((h) => new Date(h).getTime() >= nowTime);
  return index === -1 ? Math.max(0, hours.length - 1) : index;
}

export type TickLevel = "hour" | "six-hour" | "day";

/** Graduation level for a slider tick at this local (Europe/Stockholm) hour. */
export function classifyTick(date: Date): TickLevel {
  const hour = Number(stockholmHour(date));
  if (hour === 0) return "day";
  if (hour % 6 === 0) return "six-hour";
  return "hour";
}

/** Short day-boundary label, e.g. "TUE". */
export function tickDayLabel(date: Date): string {
  return stockholmWeekday(date);
}

/** Local hour-of-day label for a six-hour/hour tick, e.g. "06", "12", "18" -
 * per the task's explicit "add hours of day directly to the timeline"
 * requirement. Same Europe/Stockholm + DST-safe formatting as everywhere
 * else in this module. */
export function tickHourLabel(date: Date): string {
  return stockholmHour(date);
}

/**
 * NOW's fractional position (0..1) along the slider track spanned by
 * `hours` (ascending, assumed hourly) - independent of the selected index.
 * This is the real clock position, not "which index is closest to now";
 * moving the slider's selection never changes this, and it drifts smoothly
 * between hourly ticks as real time passes rather than jumping index-to-
 * index. Clamped to [0,1] if `now` falls outside the array's range (stale
 * data still gets a sane position, at an edge, rather than an undefined
 * one). Returns null only when there's no track to position against.
 */
export function nowPositionFraction(hours: string[], now: Date): number | null {
  if (hours.length < 2) return null;
  const times = hours.map((h) => new Date(h).getTime());
  const maxIndex = times.length - 1;
  const nowMs = now.getTime();

  if (nowMs <= times[0]) return 0;
  if (nowMs >= times[maxIndex]) return 1;

  for (let i = 0; i < maxIndex; i++) {
    if (nowMs >= times[i] && nowMs <= times[i + 1]) {
      const span = times[i + 1] - times[i];
      const frac = span === 0 ? 0 : (nowMs - times[i]) / span;
      return (i + frac) / maxIndex;
    }
  }
  return null; // unreachable given the clamps above, but keeps the function total
}
