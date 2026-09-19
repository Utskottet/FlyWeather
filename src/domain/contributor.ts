import { canonicalClubName, isKnownClub } from "./clubs.ts";

/**
 * Who is making an edit, and the two things they have to affirm first.
 *
 * Startvind has no accounts and deliberately wants none. A pilot who
 * notices that a site's wind band is wrong should be able to fix it from
 * the hill, on a phone, without registering - the same bargain Wikipedia
 * makes. What replaces the account is attribution: every edit carries a
 * name and a club, both written into the site file and into the public
 * edit log, so a change is never anonymous even though the person making
 * it never proved who they are.
 *
 * That is honest about its own limit. Nothing here verifies an identity;
 * anyone can type any name. It records who *says* they made the change,
 * which is enough for the real failure mode (a well-meaning pilot getting
 * a number wrong, and someone needing to ask them about it) and no use at
 * all against someone determined to lie. For that there is the admin
 * layer and git history, not this.
 *
 * The password is not gone - it is demoted. It guards revert and hide,
 * which is where it was always doing real work, rather than standing
 * between an ordinary pilot and a correction.
 */

export interface Contributor {
  name: string;
  /**
   * The club this pilot flies with, typed by hand and checked against the
   * list (domain/clubs.ts). Required: it is the one question on this form
   * that a script cannot answer and a pilot answers without thinking.
   */
  club: string;
  /** "Jag är en människa" */
  isHuman: boolean;
  /** "Jag är här för att jag vill förbättra världen för mina flygande medmänniskor" */
  goodFaith: boolean;
  /**
   * Honeypot. A real form leaves this empty because it is hidden from
   * people; a bot that fills every input it finds gives itself away. Kept
   * even though it only stops the laziest scripts, because it costs one
   * field and no friction for anyone real.
   */
  trap?: string;
}

export const EMPTY_CONTRIBUTOR: Contributor = {
  name: "",
  club: "",
  isHuman: false,
  goodFaith: false,
  trap: "",
};

export interface ContributorProblem {
  field: "name" | "club" | "isHuman" | "goodFaith" | "trap";
  message: string;
}

/**
 * A full name means at least two parts of two characters or more.
 *
 * Deliberately lenient past that: people have three names, hyphens,
 * apostrophes and particles, and a stricter rule rejects real pilots to
 * catch a careless one. The point is that "x" and "admin" are not an
 * audit trail - not to adjudicate names.
 *
 * Duplicated in editor-worker/src/publish.ts on purpose: a provenance rule
 * that holds only when the client cooperates is not a rule.
 */
export function isFullName(value: string): boolean {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter((part) => part.length >= 2).length >= 2
  );
}

/** Swedish, because every contributor-facing string on this site is. */
export function validateContributor(c: Contributor): ContributorProblem[] {
  const problems: ContributorProblem[] = [];
  if (!isFullName(c.name)) {
    problems.push({ field: "name", message: "Skriv ditt för- och efternamn." });
  }
  if (c.club.trim() === "") {
    problems.push({ field: "club", message: "Skriv vilken klubb du flyger med." });
  } else if (!isKnownClub(c.club)) {
    // Never a dead end: a club that is genuinely new must not silently
    // lose the first pilot who comes from it, so the message says what to
    // do next rather than only refusing.
    problems.push({
      field: "club",
      message:
        "Den klubben finns inte. Hur är det egentligen? Skriv namnet eller förkortningen, " +
        "t.ex. CPS eller Club Parapente Syd. Ny klubb som saknas i listan? Hör av dig så lägger vi till den.",
    });
  }
  if (!c.isHuman) {
    problems.push({
      field: "isHuman",
      message: "Kryssa i rutan om att du är en människa.",
    });
  }
  if (!c.goodFaith) {
    problems.push({
      field: "goodFaith",
      message: "Kryssa i rutan om varför du är här.",
    });
  }
  if (c.trap !== undefined && c.trap.trim() !== "") {
    // Never explains itself. A bot that is told which field gave it away
    // simply stops filling that one in.
    problems.push({ field: "trap", message: "Ändringen kunde inte sparas." });
  }
  return problems;
}

/** "Edvin Buregren (Club Parapente Syd)" - one string for a log line or a byline. */
export function contributorLabel(name: string, club?: string): string {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanClub = club?.trim();
  return cleanClub ? `${cleanName} (${cleanClub})` : cleanName;
}

/**
 * The contributor as it should be recorded, rather than as it was typed.
 *
 * Spacing is tidied and the club is replaced by the club's own spelling
 * of its name, so "cps", "CPS " and "club parapente syd" all end up
 * crediting one club in the log and in the derived maintainer - otherwise
 * the same person would count as three different contributors depending
 * on how they typed it that day.
 */
export function canonicalContributor(c: Contributor): Contributor {
  return {
    ...c,
    name: c.name.trim().replace(/\s+/g, " "),
    club: canonicalClubName(c.club),
  };
}
