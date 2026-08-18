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
