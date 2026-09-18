import { parse as parseYaml } from "yaml";
import { mergeSiteYaml } from "../../src/domain/siteYaml.ts";
import { siteFileSchema, parseSitePath } from "../../src/domain/siteFile.ts";

/**
 * The publish use-case: turn an editor payload into one atomic commit on
 * the site repository.
 *
 * Deliberately knows nothing about HTTP, Cloudflare or GitHub's wire
 * format - it talks to a RepoGateway, so every rule below (the move-source
 * fix, conflict detection, duplicate ids, schema validation) is tested
 * against a fake repository rather than a live one. github.ts supplies the
 * real implementation.
 *
 * The site files in the GitHub repository remain the single source of
 * truth: nothing is cached or mirrored here, every publish reads the
 * current file, merges into it, and writes it straight back.
 */

export interface CommitInput {
  /** Path of the file to write, relative to the repo root (sites/...). */
  writePath: string;
  /** Path to delete in the SAME commit, for a move or rename. */
  deletePath?: string;
  text: string;
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
  /**
   * The head the editor last saw. When supplied and stale, the publish is
   * refused as a conflict instead of silently overwriting whatever landed
   * in between.
   */
  baseSha?: string;
}

export type PublishResult =
  | { ok: true; commitSha: string; path: string; movedFrom?: string }
  | { ok: false; code: PublishErrorCode; message: string };

export type PublishErrorCode =
  | "invalid_path"
  | "unsigned"
  | "invalid_site"
  | "duplicate_id"
  | "conflict"
  | "not_found"
  | "upstream_error";

const SITES_ROOT = "sites";

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

/**
 * A full name, matching domain/siteEditor.ts's isFullName. Re-stated rather
 * than imported so the rule is enforced server-side even if the editor's
 * copy is ever loosened: a provenance rule that only holds when the client
 * cooperates is not a rule.
 */
function isFullName(value: unknown): value is string {
  return typeof value === "string" && value.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2;
}

function fail(code: PublishErrorCode, message: string): PublishResult {
  return { ok: false, code, message };
}

export async function publishSite(
  repo: RepoGateway,
  request: PublishRequest,
  now: Date = new Date(),
): Promise<PublishResult> {
  try {
    return await attemptPublish(repo, request, now);
  } catch (err) {
    // Every repository call can fail (GitHub down, credential expired,
    // rate limit). Turned into a structured result here so the Worker
    // never answers with an exception: a raw throw would surface a stack
    // trace complete with internal file paths, and tell the operator
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
): Promise<PublishResult> {
  const pathError = validateSitePath(request.path);
  if (pathError) return fail("invalid_path", `Destination ${pathError}`);
  if (request.previousPath) {
    const prevError = validateSitePath(request.previousPath);
    if (prevError) return fail("invalid_path", `Original ${prevError}`);
  }

  if (!isFullName(request.fields.last_edited_by)) {
    return fail("unsigned", "A first name and surname are required to publish.");
  }

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
  const clash = sitePaths.find(
    (p) => idFromPath(p) === expectedId && p !== destinationPath && p !== sourcePath,
  );
  if (clash) {
    return fail("duplicate_id", `Site id "${expectedId}" is already used by ${clash.replace(`${SITES_ROOT}/`, "")}.`);
  }

  // Stamped here rather than taken from the payload: a wrong clock or a
  // form left open for an hour would otherwise record a time the edit did
  // not happen at.
  const fields = { ...request.fields, last_edited_at: now.toISOString() };
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
  const action = existing === null ? "Add" : isMove ? "Move" : "Update";
  const summary = `${action} ${String(request.fields.name ?? expectedId)} via the site editor`;
  const message = `${summary}\n\nPublished by ${request.fields.last_edited_by}.`;

  try {
    // One commit containing both the write and the delete, so a move can
    // never half-apply into a duplicated or a vanished site.
    const { commitSha } = await repo.commit({
      writePath: destinationPath,
      deletePath: isMove ? sourcePath : undefined,
      text,
      message,
      expectedHeadSha: headSha,
    });
    return {
      ok: true,
      commitSha,
      path: request.path,
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
