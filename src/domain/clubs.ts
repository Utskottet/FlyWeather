import clubsRaw from "../../data/clubs.json?raw";

/**
 * The clubs the contributor form offers, read from data/clubs.json at
 * build time.
 *
 * Imported as text and parsed here rather than fetched: the list changes
 * when somebody commits a change to it, which is also when the site is
 * rebuilt, so a runtime fetch would add a request and a failure mode to
 * deliver data that is already known at build time. See data/README.md
 * for why it is repo data and deliberately not scraped from ssff.se.
 *
 * A corrupt file yields an empty list rather than a blank page. The club
 * field is optional anyway (see NO_CLUB below), so an editor with no clubs
 * to offer still works - it just offers free text.
 */

export interface Club {
  name: string;
  abbreviation?: string;
  region?: string;
}

/**
 * The option the form appends itself. Not a club, so it is not in the
 * data file: choosing it reveals a free-text field, so a pilot from a new
 * club, a visiting pilot, or someone who simply is not a member is never
 * turned away by a list that has not caught up with them.
 */
export const NO_CLUB = "Annan / ingen klubb";

export const CLUBS: Club[] = parseClubs(clubsRaw);

export function parseClubs(text: string): Club[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Club => typeof c === "object" && c !== null && typeof (c as Club).name === "string")
      .map((c) => ({
        name: c.name,
        ...(c.abbreviation ? { abbreviation: c.abbreviation } : {}),
        ...(c.region ? { region: c.region } : {}),
      }));
  } catch {
    return [];
  }
}

/** Whether a remembered club still exists in the list - it may have been renamed or dissolved. */
export function isKnownClub(name: string, clubs: Club[] = CLUBS): boolean {
  return clubs.some((c) => c.name === name);
}
