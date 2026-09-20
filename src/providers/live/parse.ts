/**
 * Shared parsing rules for live observations.
 *
 * Ported from the station-finder prototype's lib/core.js, where each of
 * these was written against a real response that broke a naiver version:
 * Swedish decimal commas, wall-clock timestamps with no offset, and
 * values that are technically numbers but cannot be wind.
 */

/** A number, or null. Accepts the Swedish decimal comma; refuses anything else outright. */
export function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(trimmed)) return null;
  return Number(trimmed.replace(",", "."));
}

/**
 * Whether a speed/direction pair can be wind at all.
 *
 * 150 m/s is far past any Swedish surface reading and well past any
 * plausible sensor value; it is there to catch a unit mix-up or a
 * sentinel value, not to second-guess the weather. 360 is accepted as
 * well as 0 because both appear in real feeds for north.
 */
export function validWind(speedMs: number | null, directionDeg: number | null): boolean {
  return (
    speedMs !== null &&
    directionDeg !== null &&
    speedMs >= 0 &&
    speedMs <= 150 &&
    directionDeg >= 0 &&
    directionDeg <= 360
  );
}

/** A gust that is a real measurement rather than a sentinel. Null passes through as null. */
export function validGust(gustMs: number | null): number | null {
  if (gustMs === null) return null;
  return gustMs >= 0 && gustMs <= 150 ? gustMs : null;
}

export const KNOTS_TO_MS = 1852 / 3600;
export const KMH_TO_MS = 1 / 3.6;
export const MPH_TO_MS = 0.44704;

/**
 * Resolves a Swedish wall-clock timestamp ("2026-09-20 14:35:00") to an
 * instant, or null when it is genuinely ambiguous.
 *
 * ViVa publishes local time with no offset. For one hour each autumn that
 * is two different instants, and there is no way to tell which. Guessing
 * would put a reading up to an hour out - on the wrong side of every
 * freshness threshold - so the ambiguous hour returns null and the caller
 * reports the age as unknown instead of inventing one.
 *
 * Implemented by formatting both candidate instants back into Stockholm
 * time and keeping the one that round-trips. In the repeated hour both
 * round-trip, which is precisely the case being detected.
 */
export function stockholmTimestamp(text: unknown): string | null {
  if (typeof text !== "string" || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(text)) return null;
  const asUtc = Date.parse(`${text.replace(" ", "T")}Z`);
  if (!Number.isFinite(asUtc)) return null;

  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const candidates = [1, 2]
    .map((offsetHours) => asUtc - offsetHours * 3_600_000)
    .filter((ms) => format.format(ms) === text);

  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}
