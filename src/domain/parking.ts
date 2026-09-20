/**
 * Getting a parking spot out of whatever somebody pasted.
 *
 * The honest authoring flow for this is "open Google Maps, find the
 * place, copy something, paste it here" - so this accepts the several
 * shapes that "something" actually takes, rather than demanding two
 * decimal numbers in a particular order and blaming the contributor when
 * they paste a URL instead.
 *
 * What it will NOT do is follow a short link. A maps.app.goo.gl address
 * contains no coordinates at all; the only way to learn where it points
 * is to make a request and see where it redirects, which means fetching
 * a contributor-supplied URL from our servers - exactly the thing the
 * station allowlist exists to prevent. Better to say plainly that the
 * short link cannot be read and ask for "Copy coordinates" instead.
 */

export interface ParkingSpot {
  lat: number;
  lon: number;
  note?: string;
}

export type ParkingParse =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: "empty" | "short-link" | "unrecognised" | "out-of-range" };

/** Latitude/longitude as a pair of decimal numbers, in either of the usual separators. */
const PAIR = /(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/;

/** Google's own map URLs put the viewport centre after an @. */
const AT_FORM = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;

/** ?q=, ?ll=, ?daddr=, /dir/?destination= all carry a plain pair. */
const QUERY_FORM = /[?&](?:q|ll|daddr|destination|center)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function inRange(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * Accepts, in this order:
 *
 *   55.411020, 13.995150                       (Google Maps "Copy coordinates")
 *   55.411020 13.995150                        (space separated)
 *   https://www.google.com/maps/@55.41,13.99,17z
 *   https://www.google.com/maps?q=55.41,13.99
 *   https://www.google.com/maps/dir/?api=1&destination=55.41,13.99
 *
 * The URL forms are checked before the bare pair, because a maps URL also
 * contains a zoom level and other numbers that a naive pair match would
 * happily mistake for a coordinate.
 */
export function parseParkingLocation(input: string): ParkingParse {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };

  // Short links resolve only by following a redirect - see the module
  // comment for why this refuses rather than fetches.
  if (/(?:goo\.gl|maps\.app\.goo\.gl|g\.co)\//i.test(text)) return { ok: false, reason: "short-link" };

  const match = AT_FORM.exec(text) ?? QUERY_FORM.exec(text) ?? PAIR.exec(text);
  if (!match) return { ok: false, reason: "unrecognised" };

  const lat = toNumber(match[1]);
  const lon = toNumber(match[2]);
  if (!inRange(lat, lon)) return { ok: false, reason: "out-of-range" };

  // Rounded to about a metre. More digits than that is false precision
  // about a gravel lot, and it keeps the YAML readable.
  return { ok: true, lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

/**
 * A link that starts navigation rather than merely showing a pin.
 *
 * Google's documented cross-platform format: it opens the Google Maps
 * app where one is installed - which on a phone in a car park is the
 * whole point - and the website otherwise. The coordinate is the
 * destination, so it works regardless of whether the spot has a name,
 * a postal address or anything else Google knows about.
 */
export function navigationUrl(spot: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}`;
}

/** Why a pasted value was refused, in Swedish and English, for the editor to show as-is. */
export function parkingProblem(reason: Exclude<ParkingParse, { ok: true }>["reason"]): string | null {
  switch (reason) {
    case "empty":
      return null;
    case "short-link":
      return "Korta Google-länkar (maps.app.goo.gl) går inte att läsa. Högerklicka på platsen i Google Maps och välj “Kopiera koordinater”. / Short Google links cannot be read - use “Copy coordinates” instead.";
    case "out-of-range":
      return "Det där är inga giltiga koordinater. / Those are not valid coordinates.";
    case "unrecognised":
    default:
      return "Klistra in koordinater (55.41, 13.99) eller en Google Maps-länk. / Paste coordinates or a Google Maps link.";
  }
}
