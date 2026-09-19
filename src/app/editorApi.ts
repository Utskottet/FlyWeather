import type { Contributor } from "../domain/contributor.ts";

/**
 * Where the site editor sends a save, and how publishing progress is read
 * back.
 *
 * Two targets, one interface:
 *
 *  - "worker"  the public website's real path. Posts to the publishing
 *              Worker, which commits to the GitHub repository. No sign-in:
 *              a save carries a contributor (name, club, two
 *              affirmations) and the Worker refuses anything unsigned. The
 *              GitHub credential lives only in the Worker's secrets and
 *              never reaches this code.
 *  - "local"   `npm run dev` only. Posts to the Vite plugin, which writes
 *              the file straight into the working tree. No account, no
 *              network, no deploy - kept because it is instant, and
 *              editing at a desk should not need a round trip to GitHub.
 *
 * The session token below is for the ADMIN layer only - revert, hide,
 * block - and an ordinary edit never needs one. It is deliberately in
 * sessionStorage rather than localStorage: it is a short-lived
 * credential, and it should not outlive the tab.
 */

const SESSION_KEY = "startvind-editor-session";

export type PublishTarget = { kind: "local" } | { kind: "worker"; baseUrl: string };

/**
 * A Worker URL wins wherever it is configured, including in dev, so the
 * real publishing path can be exercised locally. With none set, editing
 * only exists under a dev server - a built copy with no Worker has nothing
 * that could accept a save, so it must not offer one.
 */
export function resolvePublishTarget(
  workerUrl: string | undefined = import.meta.env.VITE_EDITOR_API_URL,
  isDev: boolean = import.meta.env.DEV,
): PublishTarget | null {
  const trimmed = workerUrl?.trim().replace(/\/+$/, "");
  if (trimmed) return { kind: "worker", baseUrl: trimmed };
  if (isDev) return { kind: "local" };
  return null;
}

export const PUBLISH_TARGET: PublishTarget | null = resolvePublishTarget();

export function readSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(SESSION_KEY, token);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Non-fatal: the operator just signs in again.
  }
}

export function signOut(): void {
  writeSessionToken(null);
}

export interface PublishFields {
  [key: string]: unknown;
}

export interface PublishInput {
  path: string;
  previousPath?: string;
  fields: PublishFields;
  /** Who is making this edit. The Worker refuses a save without one. */
  contributor: Contributor;
  /** The repo head the editor loaded against, so a concurrent change is a conflict rather than an overwrite. */
  baseSha?: string;
}

export interface VerifyInput {
  path: string;
  contributor: Contributor;
  baseSha?: string;
}

export type PublishOutcome =
  | { ok: true; kind: "local"; path: string }
  | { ok: true; kind: "worker"; path: string; commitSha: string; movedFrom?: string }
  | { ok: false; code: PublishFailure; message: string };

export type PublishFailure =
  | "not_configured"
  | "unauthorised"
  | "conflict"
  | "rejected"
  | "no_change"
  | "network"
  | "upstream";

interface WorkerError {
  error?: string;
  code?: string;
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function signIn(password: string, target: PublishTarget | null = PUBLISH_TARGET): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!target || target.kind !== "worker") {
    return { ok: false, message: "Publishing is not configured for this site." };
  }
  try {
    const response = await fetch(`${target.baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = (await parseJson(response)) as { token?: string } & WorkerError;
    if (!response.ok || !body.token) {
      return { ok: false, message: body.error ?? `Sign-in failed (HTTP ${response.status}).` };
    }
    writeSessionToken(body.token);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Could not reach the publishing service. ${(err as Error).message}` };
  }
}

/** The signed-in operator plus the repo head to base an edit on, or null when not signed in. */
export async function currentSession(
  target: PublishTarget | null = PUBLISH_TARGET,
): Promise<{ sub: string; headSha?: string } | null> {
  if (!target || target.kind !== "worker") return null;
  const token = readSessionToken();
  if (!token) return null;
  try {
    const response = await fetch(`${target.baseUrl}/api/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      // An expired or revoked token should not linger and keep failing.
      if (response.status === 401) writeSessionToken(null);
      return null;
    }
    const body = (await parseJson(response)) as { sub?: string; headSha?: string };
    return body.sub ? { sub: body.sub, headSha: body.headSha } : null;
  } catch {
    return null;
  }
}

export async function publish(
  input: PublishInput,
  target: PublishTarget | null = PUBLISH_TARGET,
): Promise<PublishOutcome> {
  if (!target) {
    return { ok: false, code: "not_configured", message: "Publishing is not configured for this site." };
  }

  if (target.kind === "local") {
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await parseJson(response)) as { ok?: boolean } & WorkerError;
      if (!response.ok || !body.ok) {
        return { ok: false, code: "rejected", message: body.error ?? `Save failed (HTTP ${response.status}).` };
      }
      return { ok: true, kind: "local", path: input.path };
    } catch (err) {
      return {
        ok: false,
        code: "network",
        message: `Could not reach the local save endpoint - is this running under "npm run dev"? (${(err as Error).message})`,
      };
    }
  }

  // No token required: publishing is open and signed rather than
  // authenticated. One is sent when an admin happens to have a session,
  // so their change is marked as an admin change in the log.
  const token = readSessionToken();

  try {
    const response = await fetch(`${target.baseUrl}/api/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    const body = (await parseJson(response)) as {
      ok?: boolean;
      commitSha?: string;
      movedFrom?: string;
    } & WorkerError;

    if (response.status === 401) {
      // Only an admin session can be rejected now, and it must not take
      // the edit with it: the same save works unsigned-in.
      writeSessionToken(null);
      return { ok: false, code: "unauthorised", message: "Adminsessionen har gått ut. Logga in igen." };
    }
    if (response.status === 409) {
      return { ok: false, code: "conflict", message: body.error ?? "Someone else published while you were editing." };
    }
    if (!response.ok || !body.ok || !body.commitSha) {
      const code: PublishFailure =
        body.code === "no_change" ? "no_change" : response.status >= 500 ? "upstream" : "rejected";
      return { ok: false, code, message: body.error ?? `Publish failed (HTTP ${response.status}).` };
    }
    return { ok: true, kind: "worker", path: input.path, commitSha: body.commitSha, movedFrom: body.movedFrom };
  } catch (err) {
    return {
      ok: false,
      code: "network",
      message: `Could not reach the publishing service. ${(err as Error).message}`,
    };
  }
}

/**
 * The repo head to base an edit on, from the unauthenticated health
 * endpoint.
 *
 * Sent back with a save so a change that lands while somebody is typing
 * becomes a refusal they can act on, instead of a silent overwrite of
 * whatever the other person just published. Returning undefined is not an
 * error: the Worker's compare-and-swap at commit time still catches a
 * genuine race, this only catches it earlier and with a better message.
 */
export async function repoHead(target: PublishTarget | null = PUBLISH_TARGET): Promise<string | undefined> {
  if (!target || target.kind !== "worker") return undefined;
  try {
    const response = await fetch(`${target.baseUrl}/api/health`);
    if (!response.ok) return undefined;
    const body = (await parseJson(response)) as { headSha?: string };
    return body.headSha;
  } catch {
    return undefined;
  }
}

/**
 * "I was there and this is still right."
 *
 * Writes a line to the public log and nothing else - no change to the
 * site file. The most useful thing a pilot can usually tell this
 * catalogue is not that a number is wrong but that it is still right, and
 * there was no way to say that before.
 */
export async function verify(
  input: VerifyInput,
  target: PublishTarget | null = PUBLISH_TARGET,
): Promise<{ ok: true; commitSha: string } | { ok: false; code: PublishFailure; message: string }> {
  if (!target || target.kind !== "worker") {
    // Deliberately not faked locally: there is no log to append to under
    // the dev server, and a button that silently does nothing is worse
    // than one that says it cannot.
    return { ok: false, code: "not_configured", message: "Bekräftelser kan bara sparas på den publika sajten." };
  }
  const token = readSessionToken();
  try {
    const response = await fetch(`${target.baseUrl}/api/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    const body = (await parseJson(response)) as { ok?: boolean; commitSha?: string } & WorkerError;
    if (response.status === 409) {
      return { ok: false, code: "conflict", message: body.error ?? "Något ändrades precis. Ladda om och försök igen." };
    }
    if (!response.ok || !body.ok || !body.commitSha) {
      const code: PublishFailure = response.status >= 500 ? "upstream" : "rejected";
      return { ok: false, code, message: body.error ?? `Bekräftelsen kunde inte sparas (HTTP ${response.status}).` };
    }
    return { ok: true, commitSha: body.commitSha };
  } catch (err) {
    return { ok: false, code: "network", message: `Kunde inte nå publiceringstjänsten. ${(err as Error).message}` };
  }
}

export type DeploymentState = "pending" | "building" | "published" | "failed" | "unknown";

export async function deploymentStatus(
  commitSha: string,
  target: PublishTarget | null = PUBLISH_TARGET,
): Promise<{ state: DeploymentState; detail: string; url?: string }> {
  if (!target || target.kind !== "worker") {
    return { state: "unknown", detail: "No deployment to track for a local save." };
  }
  try {
    const response = await fetch(`${target.baseUrl}/api/deployment?sha=${encodeURIComponent(commitSha)}`);
    if (!response.ok) return { state: "unknown", detail: `Could not read deploy status (HTTP ${response.status}).` };
    const body = (await parseJson(response)) as { state?: DeploymentState; detail?: string; url?: string };
    return { state: body.state ?? "unknown", detail: body.detail ?? "", url: body.url };
  } catch {
    // The commit is already safely on GitHub at this point - only the
    // progress read failed, so say that rather than implying data loss.
    return { state: "unknown", detail: "Published, but the deploy status could not be read." };
  }
}
