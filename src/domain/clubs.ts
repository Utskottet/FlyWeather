import clubsData from "../../data/clubs.json";

/**
 * The Swedish paragliding clubs, and how forgivingly a typed one is
 * recognised.
 *
 * Naming your club is the gate on editing. It is a **shibboleth, not a
 * password**: it is not secret, it never needs distributing, it never
 * needs rotating, and it cannot be leaked - which is exactly the point.
 * Any Swedish pilot can name their club from memory; a script filling in
 * a form cannot. It stops automated traffic, not determined people, and
 * it is not meant to.
 *
 * That is also why this is a free-text field and not a dropdown. A
 * dropdown asks nothing of anybody - a bot picks the first option - and
 * the whole value of the question is that it has to be *answered*. The
 * first version of this shipped as a `<select>` and was worth nothing.
 *
 * Imported as plain JSON rather than through Vite's `?raw`, because the
 * publishing Worker imports this same module to enforce the same rule,
 * and esbuild has a JSON loader but does not know `?raw`. The rule has to
 * hold on the server: one that only applies when the client cooperates is
 * not a rule.
 *
 * See docs/CLUBS.md for the list in human-readable form and for why it is
 * deliberately names only - the source listing also carried chairmen's
 * phone numbers and email addresses, which have no business in a public
 * repository.
 */

export interface Club {
  name: string;
  abbreviation?: string;
  region?: string;
}

export const CLUBS: Club[] = (clubsData as Club[]).map((c) => ({
  name: c.name,
  ...(c.abbreviation ? { abbreviation: c.abbreviation } : {}),
  ...(c.region ? { region: c.region } : {}),
}));

/**
 * Folds a typed club down to something comparable.
 *
 * Swedish letters are folded to their ASCII base and everything that is
 * not a letter or a digit is dropped, so `CPS`, `cps`, `C.P.S.` and
 * `c p s` all collapse to `cps`, and `Åre Skärm- & Drakflygklubb`
 * collapses to `areskarmdrakflygklubb`. Nobody should be turned away by a
 * hyphen.
 */
export function normaliseClub(value: string): string {
  const folded: Record<string, string> = {
    å: "a",
    ä: "a",
    ö: "o",
    æ: "ae",
    ø: "o",
    é: "e",
    è: "e",
    ü: "u",
  };
  return value
    .toLowerCase()
    .split("")
    .map((ch) => folded[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "");
}

/** Below this, a substring match means nothing - "sk" is in half the list. */
const MIN_SUBSTRING_LENGTH = 3;

/**
 * The club somebody meant, or null.
 *
 * Forgiving on purpose, in this order of confidence:
 *
 *  1. the normalised abbreviation or full name, exactly
 *  2. the typed text contains a club's name or abbreviation - "Club
 *     Parapente Syd, Skåne" and "CPS (Malmö)" both land
 *  3. a club's name contains the typed text - "parapente" lands
 *
 * A false positive here costs nothing: somebody who names a real club and
 * then edits a site badly is exactly as revertable as anybody else. A
 * pilot turned away over a hyphen costs a contribution that never comes
 * back. So when the rules disagree, the generous one wins.
 *
 * When several clubs match, the longest matched club name wins, so
 * "Skärmflygklubben Sydost" beats a chance hit on a shorter name.
 */
export function matchClub(typed: string, clubs: Club[] = CLUBS): Club | null {
  const input = normaliseClub(typed);
  if (input === "") return null;

  const candidates = clubs.map((club) => ({
    club,
    name: normaliseClub(club.name),
    abbr: club.abbreviation ? normaliseClub(club.abbreviation) : "",
  }));

  // A full name beats an abbreviation, and both beat anything fuzzy. The
  // two are separate passes rather than one condition because a club
  // whose whole name is another club's abbreviation must win on its own
  // name, whichever order the list happens to be in.
  const byName = candidates.find((c) => c.name === input);
  if (byName) return byName.club;

  const byAbbr = candidates.find((c) => c.abbr !== "" && c.abbr === input);
  if (byAbbr) return byAbbr.club;

  if (input.length < MIN_SUBSTRING_LENGTH) return null;

  const contained = candidates
    .filter((c) => input.includes(c.name) || (c.abbr.length >= MIN_SUBSTRING_LENGTH && input.includes(c.abbr)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (contained) return contained.club;

  const containing = candidates.filter((c) => c.name.includes(input)).sort((a, b) => a.name.length - b.name.length)[0];
  return containing?.club ?? null;
}

/** Whether a typed club is recognised at all. */
export function isKnownClub(typed: string, clubs: Club[] = CLUBS): boolean {
  return matchClub(typed, clubs) !== null;
}

/**
 * The club's own spelling of its name, for what gets recorded.
 *
 * Someone typing "cps" is credited to "Club Parapente Syd", so the log
 * and the maintainer line read consistently however each pilot types it.
 * Unrecognised text comes back untouched; validation is what refuses it,
 * not this.
 */
export function canonicalClubName(typed: string, clubs: Club[] = CLUBS): string {
  return matchClub(typed, clubs)?.name ?? typed.trim();
}
