import { parse as parseYaml } from "yaml";
import { mergeSiteYaml } from "../../src/domain/siteYaml.ts";
import { siteFileSchema, parseSitePath } from "../../src/domain/siteFile.ts";
import {
  canonicalContributor,
  contributorLabel,
  validateContributor,
  type Contributor,
} from "../../src/domain/contributor.ts";
import { appendEntry, summariseChanges, type EditAction, type EditLogEntry } from "../../src/domain/editLog.ts";

/**
 * The publish use-case: turn an editor payload into one atomic commit on
 * the site repository.
 *
 * Deliberately knows nothing about HTTP, Cloudflare or GitHub's wire
 * format - it talks to a RepoGateway, so every rule below (the move-source
 * fix, conflict detection, duplicate ids, schema validation, the edit log)
 * is tested against a fake repository rather than a live one. github.ts
 * supplies the real implementation.
 *
 * The site files in the GitHub repository remain the single source of
 * truth: nothing is cached or mirrored here, every publish reads the
 * current file, merges into it, and writes it straight back.
 *
 * Publishing is NOT authenticated. Anyone who can reach the website can
 * correct a site, which is the point - see src/domain/contributor.ts. What
 * replaces the password is attribution: no edit lands without a name, and
 * every edit appends a line to the public log in the same commit. The
 * rules below are therefore about keeping the catalogue valid and the
 * record honest, not about keeping people out.
 */

export interface FileWrite {
  /** Path relative to the repo root. */
  path: string;
  text: string;
}

export interface CommitInput {
  /** Every file this commit writes. More than one so an edit and its log line are indivisible. */
  writes: FileWrite[];
  /** Path to delete in the SAME commit, for a move or rename. */
  deletePath?: string;
  message: string;
  /** The commit the change is based on; the write fails if the branch moved past it. */
  expectedHeadSha: string;
}

export interface RepoGateway {
  /** Head commit sha of the publishing branch. */
  head(): Promise<string>;
  /** Every *.yaml path under sites/ at that commit. One call, not one per file. */
  listSitePaths(commitSha: string): Promise<string[]>;
  /** File text at that commit, or null when the file does not exist. */
  readFile(commitSha: string, path: string): Promise<string | null>;
  /**
   * Write (and optionally delete) in ONE commit. Must reject rather than
   * force when the branch has moved past expectedHeadSha.
   */
  commit(input: CommitInput): Promise<{ commitSha: string }>;
}

export interface PublishRequest {
  /** Destination path relative to sites/, e.g. "se/skane/ridge/hammar.yaml". */
  path: string;
  /** The file's current path, when this edit moves or renames it. */
  previousPath?: string;
  /** Editor-owned fields, merged over the existing file. */
  fields: Record<string, unknown>;
  /** Who is making this edit. Required - an unsigned edit is refused. */
  contributor: Contributor;
  /**
   * The head the editor last saw. When supplied and stale, the publish is
   * refused as a conflict instead of silently overwriting whatever landed
   * in between.
   */
  baseSha?: string;
}

/** A one-tap "I was there and this is still right", which writes only to the log. */
export interface VerifyRequest {
  /** Path relative to sites/ of the site being confirmed. */
  path: string;
  contributor: Contributor;
  baseSha?: string;
}

export type PublishResult =
  | { ok: true; commitSha: string; path: string; movedFrom?: string; changes: string[] }
  | { ok: false; code: PublishErrorCode; message: string };

export type PublishErrorCode =
  | "invalid_path"
  | "unsigned"
  | "invalid_site"
  | "duplicate_id"
  | "conflict"
  | "not_found"
  | "no_change"
  | "upstream_error";

const SITES_ROOT = "sites";
const EDIT_LOG_PATH = "data/edit-log.jsonl";

/** Rejects anything that is not a plain 4-segment path under sites/. */
export function validateSitePath(relPath: string): string | null {
  if (!relPath.endsWith(".yaml")) return "path must end in .yaml";
  if (relPath.startsWith("/") || relPath.includes("\\")) return "path must be a plain relative path";
  const segments = relPath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return "path must not contain empty or relative segments";
  if (segments.length !== 4) {
    return "path must be <country>/<region>/<ridge|winch|archive>/<id>.yaml";
  }
  try {
    parseSitePath(relPath);
  } catch (err) {
    return (err as Error).message;
  }
  return null;
}

export function idFromPath(relPath: string): string {
  const file = relPath.split("/").pop() ?? "";
  return file.replace(/\.yaml$/, "");
}

function fail(code: PublishErrorCode, message: string): PublishResult {
  return { ok: false, code, message };
}

/**
 * The contributor check, run here and not only in the browser.
 *
 * Shared with the form by importing the same module rather than restating
 * the rules, so the two can never drift; a rule that holds only when the
 * client cooperates is not a rule, and one written down twice eventually
 * becomes two rules.
 *
 * The club check matters most here. It is the one question on the form a
 * script cannot answer, so it is the one that has to be asked again on
 * this side - a shibboleth enforced only in the browser is decoration.
 */
function checkContributor(contributor: Contributor | undefined): string | null {
  if (!contributor || typeof contributor !== "object") {
    return "Ändringen saknar avsändare. Fyll i namn och klubb och kryssa i båda rutorna.";
  }
  if (typeof contributor.name !== "string" || typeof contributor.club !== "string") {
    return "Ändringen saknar avsändare. Fyll i namn och klubb och kryssa i båda rutorna.";
  }
  const problems = validateContributor(contributor);
  if (problems.length === 0) return null;
  return problems.map((p) => p.message).join(" ");
}

function logEntry(input: {
  action: EditAction;
  siteId: string;
  path: string;
  contributor: Contributor;
  changes: string[];
  admin: boolean;
  now: Date;
}): EditLogEntry {
  const club = input.contributor.club?.trim();
  return {
    // Stamped here rather than taken from the payload: a wrong clock or a
    // form left open for an hour would otherwise record a time the edit
    // did not happen at.
    at: input.now.toISOString(),
    site: input.siteId,
    path: input.path,
    by: input.contributor.name.trim().replace(/\s+/g, " "),
    ...(club ? { club } : {}),
    action: input.action,
    ...(input.changes.length > 0 ? { changes: input.changes } : {}),
    ...(input.admin ? { admin: true as const } : {}),
  };
}

export async function publishSite(
  repo: RepoGateway,
  request: PublishRequest,
  options: { now?: Date; admin?: boolean } = {},
): Promise<PublishResult> {
  try {
    return await attemptPublish(repo, request, options.now ?? new Date(), options.admin ?? false);
  } catch (err) {
    // Every repository call can fail (GitHub down, credential expired,
    // rate limit). Turned into a structured result here so the Worker
    // never answers with an exception: a raw throw would surface a stack
    // trace complete with internal file paths, and tell the contributor
    // nothing about whether their work was saved.
    const message = (err as Error).message ?? "Unknown error";
    if (/conflict|not a fast forward|non-fast-forward/i.test(message)) {
      return fail("conflict", "Someone else published while this was saving. Reload and re-apply your change.");
    }
    return fail("upstream_error", `The publishing service could not reach GitHub. ${message}`);
  }
}

async function attemptPublish(
  repo: RepoGateway,
  request: PublishRequest,
  now: Date,
  admin: boolean,
): Promise<PublishResult> {
  const pathError = validateSitePath(request.path);
  if (pathError) return fail("invalid_path", `Destination ${pathError}`);
  if (request.previousPath) {
    const prevError = validateSitePath(request.previousPath);
    if (prevError) return fail("invalid_path", `Original ${prevError}`);
  }

  const contributorError = checkContributor(request.contributor);
  if (contributorError) return fail("unsigned", contributorError);
  // Recorded as the club spells its own name, not as this pilot typed it,
  // so "cps" and "Club Parapente Syd" credit one club rather than two.
  const contributor = canonicalContributor(request.contributor);

  const expectedId = idFromPath(request.path);
  if (request.fields.id !== expectedId) {
    return fail(
      "invalid_site",
      `Site id "${String(request.fields.id)}" must match its filename ("${expectedId}.yaml").`,
    );
  }

  const headSha = await repo.head();
  if (request.baseSha && request.baseSha !== headSha) {
    return fail(
      "conflict",
      "The site catalogue changed while you were editing. Reload to pick up the newer version, then re-apply your change.",
    );
  }

  // THE MOVE FIX: merge into the file being edited, which on a move is the
  // one at previousPath - never the (nonexistent) destination. Reading the
  // destination made a move silently drop everything the editor does not
  // model, because the merge had no prior document and wrote a fresh one.
  const sourcePath = `${SITES_ROOT}/${request.previousPath ?? request.path}`;
  const existing = await repo.readFile(headSha, sourcePath);
  if (request.previousPath && existing === null) {
    return fail("not_found", `The site being moved no longer exists at ${request.previousPath}.`);
  }

  // Duplicate ids fail the catalogue build, which would break the deploy
  // for every site rather than just this one. Every file in the repo is
  // named after its own id (verified across all 31), so the repo's file
  // list answers this in one call instead of 31.
  const destinationPath = `${SITES_ROOT}/${request.path}`;
  const sitePaths = await repo.listSitePaths(headSha);
  const clash = sitePaths.find((p) => idFromPath(p) === expectedId && p !== destinationPath && p !== sourcePath);
  if (clash) {
    return fail("duplicate_id", `Site id "${expectedId}" is already used by ${clash.replace(`${SITES_ROOT}/`, "")}.`);
  }

  // last_edited_by is taken from the contributor block rather than from
  // the submitted fields, so the name in the file and the name in the log
  // are the same name by construction and cannot be made to disagree.
  const fields = {
    ...request.fields,
    last_edited_by: contributor.name,
    last_edited_at: now.toISOString(),
  };
  const text = mergeSiteYaml(existing, fields);

  // Validate what will actually be committed, not what was submitted -
  // the merge is what produces the final document, so it is the merged
  // text that has to satisfy the schema the build will run.
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    return fail("invalid_site", `The merged file is not valid YAML: ${(err as Error).message}`);
  }
  const check = siteFileSchema.safeParse(parsed);
  if (!check.success) {
    const detail = check.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return fail("invalid_site", `The site would fail the catalogue build - ${detail}`);
  }

  const isMove = request.previousPath !== undefined && sourcePath !== destinationPath;
  const before = existing === null ? null : (safeParse(existing) as Record<string, unknown> | null);
  const changes = summariseChanges(before, parsed as Record<string, unknown>, {
    from: request.previousPath,
    to: request.path,
  });

  // Nothing changed: refused rather than committed. A no-op commit would
  // put a line in the log claiming an edit that did not happen, trigger a
  // deploy, and make the history harder to read for no gain. Pressing save
  // on an unchanged form is a normal thing to do by accident.
  if (existing !== null && changes.length === 0) {
    return fail("no_change", "Ingenting har ändrats, så inget sparades.");
  }

  const action: EditAction = existing === null ? "add" : isMove ? "move" : "edit";
  const entry = logEntry({
    action,
    siteId: expectedId,
    path: request.path,
    contributor,
    changes,
    admin,
    now,
  });
  const logText = appendEntry(await repo.readFile(headSha, EDIT_LOG_PATH), entry);

  const verb = action === "add" ? "Add" : action === "move" ? "Move" : "Update";
  const who = contributorLabel(contributor.name, contributor.club);
  const message =
    `${verb} ${String(request.fields.name ?? expectedId)} via the site editor\n\n` +
    `${changes.join("\n")}\n\nPublished by ${who}.`;

  try {
    // One commit containing the site file, the log line and any delete, so
    // a move can never half-apply into a duplicated or a vanished site -
    // and an edit can never exist without its record.
    const { commitSha } = await repo.commit({
      writes: [
        { path: destinationPath, text },
        { path: EDIT_LOG_PATH, text: logText },
      ],
      deletePath: isMove ? sourcePath : undefined,
      message,
      expectedHeadSha: headSha,
    });
    return {
      ok: true,
      commitSha,
      path: request.path,
      changes,
      ...(isMove ? { movedFrom: request.previousPath } : {}),
    };
  } catch (err) {
    const message = (err as Error).message;
    if (/conflict|not a fast forward|non-fast-forward/i.test(message)) {
      return fail("conflict", "Someone else published while this was saving. Reload and re-apply your change.");
    }
    return fail("upstream_error", message);
  }
}

/**
 * Confirming a site without changing it.
 *
 * The most valuable thing a pilot can tell this catalogue is usually not
 * that a number is wrong - it is that a number is still right. Data nobody
 * has looked at in three years and data checked last Sunday look identical
 * in a YAML file, and only one of them should be flown on.
 *
 * So this writes to the log and not to the site file. There is nothing to
 * change in the site, and stamping last_edited_at for a verification would
 * make "when was this last edited" and "when was this last confirmed" the
 * same field, which is exactly the distinction worth keeping.
 */
export async function verifySite(
  repo: RepoGateway,
  request: VerifyRequest,
  options: { now?: Date; admin?: boolean } = {},
): Promise<PublishResult> {
  const now = options.now ?? new Date();
  try {
    const pathError = validateSitePath(request.path);
    if (pathError) return fail("invalid_path", `Destination ${pathError}`);

    const contributorError = checkContributor(request.contributor);
    if (contributorError) return fail("unsigned", contributorError);
    const contributor = canonicalContributor(request.contributor);

    const headSha = await repo.head();
    if (request.baseSha && request.baseSha !== headSha) {
      return fail("conflict", "The site catalogue changed while you were looking at it. Reload and confirm again.");
    }

    const sitePath = `${SITES_ROOT}/${request.path}`;
    if ((await repo.readFile(headSha, sitePath)) === null) {
      return fail("not_found", `There is no site at ${request.path}.`);
    }

    const siteId = idFromPath(request.path);
    const entry = logEntry({
      action: "verify",
      siteId,
      path: request.path,
      contributor,
      changes: [],
      admin: options.admin ?? false,
      now,
    });
    const logText = appendEntry(await repo.readFile(headSha, EDIT_LOG_PATH), entry);
    const who = contributorLabel(contributor.name, contributor.club);

    const { commitSha } = await repo.commit({
      writes: [{ path: EDIT_LOG_PATH, text: logText }],
      message: `Confirm ${siteId} is still accurate\n\nConfirmed by ${who}.`,
      expectedHeadSha: headSha,
    });
    return { ok: true, commitSha, path: request.path, changes: [] };
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    if (/conflict|not a fast forward|non-fast-forward/i.test(message)) {
      return fail("conflict", "Someone else published while this was saving. Try again.");
    }
    return fail("upstream_error", `The publishing service could not reach GitHub. ${message}`);
  }
}

/** YAML that fails to parse is treated as "no prior document" for the summary only - never for the write. */
function safeParse(text: string): unknown {
  try {
    return parseYaml(text);
  } catch {
    return null;
  }
}
