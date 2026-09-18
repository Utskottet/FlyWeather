/**
 * The public record of who changed what.
 *
 * Kept in the repository as JSON Lines (data/edit-log.jsonl), appended to
 * in the same commit as the site file it describes. That choice is the
 * whole design:
 *
 *  - No database. A log in a database is a second source of truth that can
 *    disagree with the repository, needs its own backups, its own access
 *    control and its own migration story. A log in the repo is backed up
 *    by every clone, readable by anyone, and can never drift from the data
 *    it describes because the same commit carries both.
 *  - Atomic. An edit and its log entry land together or not at all. There
 *    is no window in which a site changed and nobody knows who did it.
 *  - Already revertable. `git revert` undoes the edit and its log line in
 *    one move, and the revert is itself in the history. A bespoke undo on
 *    top of a database would be re-implementing what git does properly.
 *
 * One line per entry rather than one JSON array: an append is a string
 * concatenation instead of a parse-modify-serialise, and two edits landing
 * close together produce a clean one-line diff each rather than fighting
 * over the array's formatting.
 *
 * The cost is a commit (and so a deploy) per entry, including for a bare
 * verification. At this site's volume - a handful of edits a week - that
 * is nothing, and it buys a log with no infrastructure behind it at all.
 */

export type EditAction = "add" | "edit" | "move" | "verify" | "revert" | "archive";

export interface EditLogEntry {
  /** ISO 8601, stamped server-side at write time - never from the browser's clock. */
  at: string;
  /** Site id, which is also the file's basename. */
  site: string;
  /** Path relative to sites/, so an entry still makes sense after a move. */
  path: string;
  by: string;
  club?: string;
  action: EditAction;
  /** Human-readable Swedish summary of what actually changed. */
  changes?: string[];
  /** Present only when an admin session made the change. */
  admin?: true;
}

export function serialiseEntry(entry: EditLogEntry): string {
  // Key order fixed so the file diffs cleanly and a human can scan a
  // column of lines. JSON.stringify follows insertion order for string
  // keys, which is exactly the guarantee needed here.
  const ordered: EditLogEntry = {
    at: entry.at,
    site: entry.site,
    path: entry.path,
    by: entry.by,
    ...(entry.club ? { club: entry.club } : {}),
    action: entry.action,
    ...(entry.changes && entry.changes.length > 0 ? { changes: entry.changes } : {}),
    ...(entry.admin ? { admin: true as const } : {}),
  };
  return JSON.stringify(ordered);
}

/**
 * Parses the log, skipping anything unreadable rather than throwing.
 *
 * A single corrupt line - a half-written append, a hand-edit gone wrong -
 * must not take the whole log, and with it the site panel, down with it.
 * The log is a record, not a load-bearing structure.
 */
export function parseEditLog(text: string | null | undefined): EditLogEntry[] {
  if (!text) return [];
  const entries: EditLogEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as EditLogEntry;
      if (typeof parsed.at === "string" && typeof parsed.site === "string" && typeof parsed.by === "string") {
        entries.push(parsed);
      }
    } catch {
      // Unreadable line - skipped, and left in the file for a human to
      // look at rather than silently rewritten away.
    }
  }
  return entries;
}

/** Appends one entry, always leaving the file newline-terminated. */
export function appendEntry(text: string | null | undefined, entry: EditLogEntry): string {
  const body = (text ?? "").replace(/\s*$/, "");
  const line = serialiseEntry(entry);
  return body === "" ? `${line}\n` : `${body}\n${line}\n`;
}

/** Newest first - what a site panel wants to show. */
export function entriesForSite(entries: EditLogEntry[], siteId: string): EditLogEntry[] {
  return entries.filter((e) => e.site === siteId).sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Who looks after this site, derived rather than declared.
 *
 * Nobody is appointed and there is no "maintainer" field to fight over:
 * the person who has touched a site most is the person who has, in fact,
 * been maintaining it. Ties go to whoever did it most recently, so a site
 * someone has taken over does not keep crediting a pilot who stopped
 * flying it years ago.
 *
 * Admin actions are excluded. Reverting vandalism on twelve sites in an
 * evening should not make the admin the maintainer of all twelve.
 */
export function deriveMaintainer(
  entries: EditLogEntry[],
  siteId: string,
): { name: string; club?: string; edits: number; lastAt: string } | null {
  const mine = entriesForSite(entries, siteId).filter((e) => !e.admin);
  if (mine.length === 0) return null;

  const byName = new Map<string, { name: string; club?: string; edits: number; lastAt: string }>();
  for (const entry of mine) {
    const key = entry.by.trim().toLowerCase();
    const found = byName.get(key);
    if (!found) {
      // entriesForSite is newest-first, so the first sighting of a person
      // already carries their latest timestamp and the club they used most
      // recently - which is the one worth crediting.
      byName.set(key, { name: entry.by.trim(), club: entry.club, edits: 1, lastAt: entry.at });
      continue;
    }
    found.edits += 1;
    if (entry.at > found.lastAt) found.lastAt = entry.at;
  }

  return [...byName.values()].sort((a, b) => b.edits - a.edits || b.lastAt.localeCompare(a.lastAt))[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Change summaries                                                     */
/* ------------------------------------------------------------------ */

type Fields = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Metres between two coordinates. Equirectangular - accurate far past the scale this reports on. */
function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.round(Math.sqrt(x * x + y * y) * R);
}

function band(value: unknown): string {
  const wind = (value ?? {}) as Fields;
  const min = num(wind.min_ms);
  const max = num(wind.max_ms);
  if (min === null || max === null) return "";
  return `${min}–${max} m/s`;
}

function sectorText(value: unknown): string {
  const sector = value as { ranges?: { from_deg?: number; to_deg?: number }[] } | null | undefined;
  if (!sector?.ranges || sector.ranges.length === 0) return "";
  return sector.ranges.map((r) => `${r.from_deg ?? "?"}–${r.to_deg ?? "?"}°`).join(", ");
}

/**
 * What changed, in Swedish, for the log and for the site panel.
 *
 * Wind and sector are spelled out with their before and after values
 * rather than reduced to "ändrad", because those two are the numbers
 * people actually fly on: a log line saying someone widened a band from
 * 4-8 to 3-11 m/s can be questioned by anyone who reads it, and one
 * saying "vindvärden ändrade" cannot. Everything else is named but not
 * quoted - a description diff belongs in git, not in a one-line summary.
 *
 * `before` is null for a new site.
 */
export function summariseChanges(before: Fields | null, after: Fields, paths?: { from?: string; to?: string }): string[] {
  const changes: string[] = [];

  if (paths?.from && paths.to && paths.from !== paths.to) {
    changes.push(`Flyttad från ${paths.from} till ${paths.to}`);
  }

  if (before === null) {
    const created: string[] = [];
    const s = sectorText(after.sector);
    const b = band(after.wind);
    if (s) created.push(`sektor ${s}`);
    if (b) created.push(`vind ${b}`);
    changes.push(created.length > 0 ? `Ny plats (${created.join(", ")})` : "Ny plats");
    return changes;
  }

  if (str(before.name) !== str(after.name) && str(after.name) !== "") {
    changes.push(`Namn: ${str(after.name)} (var ${str(before.name)})`);
  }

  const beforeBand = band(before.wind);
  const afterBand = band(after.wind);
  if (beforeBand !== afterBand && afterBand !== "") {
    changes.push(beforeBand ? `Vind ${afterBand} (var ${beforeBand})` : `Vind ${afterBand} (saknades)`);
  }

  const beforeWind = (before.wind ?? {}) as Fields;
  const afterWind = (after.wind ?? {}) as Fields;
  if (num(beforeWind.hard_max_gust_ms) !== num(afterWind.hard_max_gust_ms)) {
    const gust = num(afterWind.hard_max_gust_ms);
    changes.push(gust === null ? "Hård byvindgräns borttagen" : `Hård byvindgräns ${gust} m/s`);
  }
  if (beforeWind.verified !== afterWind.verified) {
    changes.push(
      afterWind.verified === true ? "Vindvärden markerade som verifierade" : "Vindvärden inte längre verifierade",
    );
  }

  const beforeSector = sectorText(before.sector);
  const afterSector = sectorText(after.sector);
  if (beforeSector !== afterSector && afterSector !== "") {
    changes.push(beforeSector ? `Sektor ${afterSector} (var ${beforeSector})` : `Sektor ${afterSector}`);
  }

  const bc = (before.coordinates ?? {}) as Fields;
  const ac = (after.coordinates ?? {}) as Fields;
  const bLat = num(bc.lat);
  const bLon = num(bc.lon);
  const aLat = num(ac.lat);
  const aLon = num(ac.lon);
  if (bLat !== null && bLon !== null && aLat !== null && aLon !== null) {
    const moved = metresBetween(bLat, bLon, aLat, aLon);
    // Under ~10 m is rounding in the last decimal, not somebody moving the
    // pin. Reporting it would bury the real changes in noise.
    if (moved >= 10) changes.push(`Position flyttad ${moved} m`);
  }

  if (str(before.description) !== str(after.description)) changes.push("Beskrivning ändrad");

  if (JSON.stringify(before.warnings ?? []) !== JSON.stringify(after.warnings ?? [])) {
    changes.push("Varningar ändrade");
  }
  if (JSON.stringify(before.links ?? []) !== JSON.stringify(after.links ?? [])) {
    changes.push("Länkar ändrade");
  }
  if (JSON.stringify(before.station ?? null) !== JSON.stringify(after.station ?? null)) {
    changes.push("Vindmätare ändrad");
  }

  if (num(before.ridge_height_m) !== num(after.ridge_height_m)) {
    const h = num(after.ridge_height_m);
    changes.push(h === null ? "Höjd borttagen" : `Höjd ${h} m`);
  }

  if (str(before.pilot_level) !== str(after.pilot_level) && str(after.pilot_level) !== "") {
    changes.push(`Nivå: ${str(after.pilot_level)}`);
  }

  // An empty list is the honest answer when someone pressed save without
  // changing anything; the caller decides what to do about that.
  return changes;
}
