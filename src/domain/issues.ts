import { contributorLabel } from "./contributor.ts";

/**
 * Things people think should be better.
 *
 * Kept exactly where the edit log is kept - one JSON object per line in
 * data/issues.jsonl, appended by the publishing Worker in a real commit -
 * and for the same reasons: no database to disagree with the repository,
 * backed up by every clone, readable by anyone, and revertable with one
 * git command if somebody posts something that should not stand.
 *
 * Public on both sides. Anybody can post one without an account, and
 * anybody can read the whole list. A suggestion box only the owner can
 * see is a suggestion box people stop using, because they cannot tell
 * whether theirs was the third report of the same thing or the first.
 */

export interface Issue {
  /** ISO 8601, stamped server-side - never from the browser's clock. */
  at: string;
  by: string;
  club?: string;
  text: string;
}

/** Long enough for a real description, short enough that the list stays readable. */
export const MAX_ISSUE_LENGTH = 1500;
const MIN_ISSUE_LENGTH = 10;

export function validateIssueText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_ISSUE_LENGTH) {
    return "Skriv några ord om vad som kan bli bättre. / Say a few words about what could be better.";
  }
  if (trimmed.length > MAX_ISSUE_LENGTH) {
    return `Håll det under ${MAX_ISSUE_LENGTH} tecken. / Keep it under ${MAX_ISSUE_LENGTH} characters.`;
  }
  return null;
}

export function serialiseIssue(issue: Issue): string {
  // Fixed key order, so the file diffs cleanly and a person can scan a
  // column of lines.
  const ordered: Issue = {
    at: issue.at,
    by: issue.by,
    ...(issue.club ? { club: issue.club } : {}),
    text: issue.text,
  };
  return JSON.stringify(ordered);
}

/**
 * Parses the list, skipping anything unreadable rather than throwing.
 * One corrupt line must not take the whole page down with it.
 */
export function parseIssues(text: string | null | undefined): Issue[] {
  if (!text) return [];
  const issues: Issue[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as Issue;
      if (typeof parsed.at === "string" && typeof parsed.by === "string" && typeof parsed.text === "string") {
        issues.push(parsed);
      }
    } catch {
      // Left in the file for a person to look at rather than silently
      // rewritten away.
    }
  }
  return issues;
}

/** Appends one issue, always leaving the file newline-terminated. */
export function appendIssue(text: string | null | undefined, issue: Issue): string {
  const body = (text ?? "").replace(/\s*$/, "");
  const line = serialiseIssue(issue);
  return body === "" ? `${line}\n` : `${body}\n${line}\n`;
}

/** Newest first - what somebody opening the list wants to see. */
export function sortedIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => b.at.localeCompare(a.at));
}

/** "Edvin Buregren (Club Parapente Syd)" - the same byline the edit log uses. */
export function issueByline(issue: Issue): string {
  return contributorLabel(issue.by, issue.club);
}
