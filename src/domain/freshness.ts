export type Freshness = "fresh" | "aging" | "stale";

/**
 * Classifies an observation's age per MASTER_SPEC.md §11.2 defaults
 * (fresh <=10min, aging <=30min, stale >30min - configurable per site
 * catalogue via SITES.md's `defaults` block).
 */
export function classifyFreshness(
  observedAt: string,
  now: Date,
  freshMinutes: number,
  staleMinutes: number,
): Freshness {
  const ageMinutes = (now.getTime() - new Date(observedAt).getTime()) / 60_000;
  if (ageMinutes <= freshMinutes) return "fresh";
  if (ageMinutes <= staleMinutes) return "aging";
  return "stale";
}

const STOCKHOLM_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const STOCKHOLM_TIME_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  hour: "2-digit",
  minute: "2-digit",
});
const STOCKHOLM_WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", weekday: "short" });

/**
 * The literal clock time a report was downloaded/generated (e.g. "06:00
 * TODAY", "18:00 SUN") rather than a relative "how old" age - per
 * explicit feedback that a raw age number ("8h 31m") still makes the
 * user do mental math against the current time to judge whether data is
 * current; an absolute time is unambiguous at a glance. Always in
 * Europe/Stockholm time regardless of the viewer's own timezone, same
 * convention SiteSheet's own timeLabel already uses - the flying
 * conditions are local to Sweden even if the viewer isn't.
 */
export function formatDownloadTime(observedAt: string, now: Date): string {
  const date = new Date(observedAt);
  const time = STOCKHOLM_TIME_FMT.format(date);
  const sameDay = STOCKHOLM_DATE_FMT.format(date) === STOCKHOLM_DATE_FMT.format(now);
  if (sameDay) return `${time} TODAY`;
  return `${time} ${STOCKHOLM_WEEKDAY_FMT.format(date).toUpperCase()}`;
}
