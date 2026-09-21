import { contributorLabel } from "./contributor.ts";
import type { EditLogEntry } from "./editLog.ts";
import type { Issue } from "./issues.ts";

/**
 * Everything that has happened, in one list.
 *
 * Edits and suggestions are kept in separate files because they are
 * different things with different rules - one changes the catalogue, the
 * other does not - but to somebody reading the site they are one story:
 * what has been going on here lately. Merging them for display costs
 * nothing and keeps both files exactly as they are.
 *
 * Every number on this page is derived from data the page already has.
 * Nothing is counted on a server, nothing is stored, and there is no
 * total that can drift away from the thing it counts - if the log says
 * twelve edits, twelve lines produced that.
 */

export type ActivityKind = "edit" | "issue";

export interface ActivityItem {
  kind: ActivityKind;
  at: string;
  by: string;
  club?: string;
  /** Site id for an edit, absent for a suggestion. */
  site?: string;
  /** What the person did, already in Swedish. */
  summary: string;
  /** The detail lines an edit carries, or the suggestion's own text. */
  detail: string[];
}

export function buildActivity(edits: EditLogEntry[], issues: Issue[]): ActivityItem[] {
  const fromEdits: ActivityItem[] = edits.map((e) => ({
    kind: "edit",
    at: e.at,
    by: e.by,
    ...(e.club ? { club: e.club } : {}),
    site: e.site,
    summary: describeEdit(e),
    detail: e.changes ?? [],
  }));

  const fromIssues: ActivityItem[] = issues.map((i) => ({
    kind: "issue",
    at: i.at,
    by: i.by,
    ...(i.club ? { club: i.club } : {}),
    summary: "skrev ett förslag",
    detail: [i.text],
  }));

  return [...fromEdits, ...fromIssues].sort((a, b) => b.at.localeCompare(a.at));
}

function describeEdit(entry: EditLogEntry): string {
  switch (entry.action) {
    case "add":
      return "la till en plats";
    case "move":
      return "flyttade en plats";
    case "verify":
      return "bekräftade uppgifterna";
    case "revert":
      return "återställde en ändring";
    case "archive":
      return "arkiverade en plats";
    case "edit":
    default:
      return "ändrade en plats";
  }
}

export interface ActivityTotals {
  edits: number;
  issues: number;
  /** Distinct people who have edited or suggested anything. */
  contributors: number;
  /** Distinct sites anybody has touched. */
  sitesTouched: number;
  /** When the most recent of anything happened, or null when nothing has. */
  latestAt: string | null;
}

/**
 * Counted from the log itself rather than kept as a running total.
 *
 * A stored number is a second source of truth that can quietly diverge
 * from what it claims to count - and the only honest way to fix one once
 * it has is to recount anyway. So this recounts, every time, from the
 * lines that are the evidence.
 */
export function totals(activity: ActivityItem[]): ActivityTotals {
  const people = new Set<string>();
  const sites = new Set<string>();
  let edits = 0;
  let issues = 0;

  for (const item of activity) {
    // Matched case-insensitively and space-normalised, so one person who
    // types their name slightly differently is still one person.
    people.add(item.by.trim().toLowerCase().replace(/\s+/g, " "));
    if (item.kind === "edit") {
      edits += 1;
      if (item.site) sites.add(item.site);
    } else {
      issues += 1;
    }
  }

  return {
    edits,
    issues,
    contributors: people.size,
    sitesTouched: sites.size,
    latestAt: activity[0]?.at ?? null,
  };
}

/** "Anna Andersson (Club Parapente Syd)" - the same byline used everywhere else. */
export function activityByline(item: ActivityItem): string {
  return contributorLabel(item.by, item.club);
}
