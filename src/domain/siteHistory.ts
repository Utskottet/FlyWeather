import logRaw from "../../data/edit-log.jsonl?raw";
import { deriveMaintainer, entriesForSite, parseEditLog, type EditLogEntry } from "./editLog.ts";

/**
 * The edit log as the website sees it, read from data/edit-log.jsonl at
 * build time.
 *
 * Bundled rather than fetched, for the same reason the site catalogue is:
 * both come out of the repository, so both are exactly as fresh as the
 * last deploy and cannot disagree with each other. A separate fetch would
 * buy nothing - the log only changes when a commit changes it, and a
 * commit is a deploy - while adding a request that can fail and a moment
 * where the panel shows a site's data next to somebody else's history.
 *
 * The honest consequence is that a pilot who saves an edit does not see
 * their own line in the log until the deploy lands, about two minutes
 * later. The editor says so while it is publishing rather than pretending
 * otherwise.
 */

export const EDIT_LOG: EditLogEntry[] = parseEditLog(logRaw);

export interface SiteHistory {
  entries: EditLogEntry[];
  maintainer: ReturnType<typeof deriveMaintainer>;
  /** The most recent confirmation that the site is still accurate, if anybody has given one. */
  lastVerified: EditLogEntry | null;
  /** The most recent actual change, which is a different question. */
  lastChanged: EditLogEntry | null;
}

export function historyFor(siteId: string, log: EditLogEntry[] = EDIT_LOG): SiteHistory {
  const entries = entriesForSite(log, siteId);
  return {
    entries,
    maintainer: deriveMaintainer(log, siteId),
    lastVerified: entries.find((e) => e.action === "verify") ?? null,
    lastChanged: entries.find((e) => e.action !== "verify") ?? null,
  };
}

/**
 * "3 sep 2026" - a date, not a timestamp.
 *
 * Nobody reading a site's history needs the minute, and a full timestamp
 * makes a list of entries much harder to scan. The exact instant is in the
 * log file and in git for anyone who does need it.
 */
export function formatLogDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

/** Swedish for what somebody did, for a log line. */
export function describeAction(entry: EditLogEntry): string {
  switch (entry.action) {
    case "add":
      return "la till platsen";
    case "move":
      return "flyttade platsen";
    case "verify":
      return "bekräftade uppgifterna";
    case "revert":
      return "återställde en ändring";
    case "archive":
      return "arkiverade platsen";
    case "edit":
    default:
      return "ändrade uppgifterna";
  }
}
