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

/**
 * Human-readable "how old" label for a report timestamp (e.g. "3m",
 * "1h 20m", "2d") - lets RASP/wind-field provenance show a literal age
 * rather than a raw model-run timestamp the user has to do math on. A
 * future timestamp (clock skew) clamps to "0m" rather than going negative.
 */
export function formatAge(observedAt: string, now: Date): string {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - new Date(observedAt).getTime()) / 60_000));
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}
