const STOCKHOLM_TZ = "Europe/Stockholm";

function stockholmDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

/**
 * Slider label per MASTER_SPEC.md §6: "NOW" at the current position,
 * plain local hour while still on today's Europe/Stockholm calendar day,
 * "MON 09"-style once the day changes.
 */
export function formatSliderLabel(date: Date, referenceNow: Date, isNow: boolean): string {
  if (isNow) return "NOW";
  if (stockholmDayKey(date) === stockholmDayKey(referenceNow)) {
    return stockholmHour(date);
  }
  return `${stockholmWeekday(date)} ${stockholmHour(date)}`;
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
