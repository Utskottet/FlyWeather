import { bearerFrom, issueToken, passwordMatches, verifyToken } from "./auth.ts";
import { createGitHubGateway, deploymentStatus, type GitHubConfig } from "./github.ts";
import { publishSite, verifySite, type PublishRequest, type VerifyRequest } from "./publish.ts";

/**
 * Startvind's publishing Worker.
 *
 * The public website stays exactly what it was - static files on GitHub
 * Pages, with the repository as the single source of truth. This Worker
 * exists only so the editor on that website can write to the repository
 * without the browser ever holding a GitHub credential: the browser asks
 * the Worker, and the Worker alone holds the token that can commit.
 *
 * Publishing is open - no password, no account. What every write must
 * carry instead is a name, a club and two affirmations, recorded in a
 * public log in the same commit (src/domain/contributor.ts explains the
 * trade). The password did not go away, it moved: it now guards the admin
 * layer, which is where it was always doing the real work. The Worker
 * remains the only thing holding a credential, and it can still only ever
 * write a site YAML file and the log - not workflows, not source, not
 * secrets.
 *
 * Deliberately NOT in the path of anything else. Weather collection,
 * forecasts and the Soaring site are untouched and keep running through
 * GitHub Actions; no visitor traffic passes through here. A publish is a
 * handful of requests a week, so the Worker can be down without the
 * website noticing.
 */

export interface Env {
  /** Fine-grained PAT with contents:write on the site repo. Secret. */
  GITHUB_TOKEN: string;
  /** Admin password - revert, hide, block. Not needed for an ordinary edit. Secret. */
  ADMIN_PASSWORD: string;
  /** HMAC key for session tokens; rotating it logs everyone out. Secret. */
  SESSION_SECRET: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  /** Comma-separated exact origins allowed to call this Worker. */
  ALLOWED_ORIGINS: string;
  /** Label for the single operator, recorded in the session. */
  ADMIN_SUBJECT?: string;
}

function githubConfig(env: Env): GitHubConfig {
  return {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || "main",
    token: env.GITHUB_TOKEN,
    userAgent: "startvind-editor-worker",
  };
}

/**
 * An exact-origin allowlist, never "*". The endpoints are authenticated,
 * but a wildcard would let any page on the internet drive a logged-in
 * operator's browser, and the set of origins that legitimately host this
 * editor is short and known.
 */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Whether this request came from a page we serve.
 *
 * Not a security boundary and not treated as one - Origin is set by the
 * browser and anything that is not a browser can send whatever it likes.
 * It is a speed bump: it stops another website from quietly driving a
 * visitor's browser into publishing, and it costs nothing. The real
 * protections against a bad edit are that every write is attributed,
 * logged in public, limited to one site YAML file, and revertable with
 * one git command.
 */
function fromAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean).includes(origin);
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });
}

async function requireSession(request: Request, env: Env): Promise<string | null> {
  const payload = await verifyToken(bearerFrom(request), env.SESSION_SECRET);
  return payload?.sub ?? null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      // Last line of defence. An uncaught throw would return Cloudflare's
      // own error page with a stack trace in it - internal paths, and no
      // usable answer for the operator about whether anything was saved.
      console.error("unhandled", err);
      return json(
        { ok: false, error: "The publishing service hit an unexpected error. Nothing was published." },
        500,
        corsHeaders(request, env),
      );
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Unauthenticated: lets the website show "publishing available" or not
    // without prompting for a password first. Deliberately reveals nothing
    // beyond which repository this Worker publishes to.
    if (url.pathname === "/api/health") {
      // Also hands out the head commit. Publishing no longer requires a
      // session, so the editor needs somewhere unauthenticated to learn
      // what it is basing an edit on - without it every save would be
      // blind and "someone else changed this while you typed" could only
      // be caught at commit time. It reveals nothing: the repository is
      // public, and this is the same sha every clone already has.
      let headSha: string | undefined;
      try {
        headSha = await createGitHubGateway(githubConfig(env)).head();
      } catch {
        // Health must answer even when GitHub does not - the website uses
        // it to decide whether to offer editing at all.
      }
      return json(
        {
          ok: true,
          repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
          branch: env.GITHUB_BRANCH || "main",
          ...(headSha ? { headSha } : {}),
        },
        200,
        cors,
      );
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { password?: unknown };
      if (!passwordMatches(body.password, env.ADMIN_PASSWORD)) {
        // One message for every failure mode, and no hint about which part
        // was wrong.
        return json({ ok: false, error: "Incorrect password." }, 401, cors);
      }
      const { token, expiresAt } = await issueToken(env.ADMIN_SUBJECT || "operator", env.SESSION_SECRET);
      return json({ ok: true, token, expiresAt }, 200, cors);
    }

    if (url.pathname === "/api/session") {
      const sub = await requireSession(request, env);
      if (!sub) return json({ ok: false, error: "Not signed in." }, 401, cors);
      // The head is handed out with the session so the editor can send it
      // back as baseSha, turning "someone else published while you were
      // typing" into a refusal instead of a silent overwrite.
      try {
        const headSha = await createGitHubGateway(githubConfig(env)).head();
        return json({ ok: true, sub, headSha }, 200, cors);
      } catch {
        // A readable session is still a valid session - only the
        // conflict check degrades, and the commit-time compare-and-swap
        // still catches a race.
        return json({ ok: true, sub }, 200, cors);
      }
    }

    if (url.pathname === "/api/publish" && request.method === "POST") {
      // No session required. Editing is open, and what stands in for a
      // password is attribution: publishSite refuses anything without a
      // full name and both affirmations, and records every accepted edit
      // in the public log in the same commit. See
      // src/domain/contributor.ts for why that trade is the right one for
      // a catalogue that pilots are supposed to keep correct.
      //
      // An admin session is still read when one is present, so an admin's
      // own changes are marked as such in the log.
      if (!fromAllowedOrigin(request, env)) {
        return json({ ok: false, error: "Ändringar tas bara emot från startvind.se." }, 403, cors);
      }

      const body = (await request.json().catch(() => null)) as PublishRequest | null;
      if (!body || typeof body.path !== "string" || typeof body.fields !== "object" || body.fields === null) {
        return json({ ok: false, error: "Malformed publish request." }, 400, cors);
      }

      const admin = (await requireSession(request, env)) !== null;
      const result = await publishSite(createGitHubGateway(githubConfig(env)), body, { admin });
      if (!result.ok) {
        const status =
          result.code === "conflict"
            ? 409
            : result.code === "upstream_error"
              ? 502
              : result.code === "unsigned"
                ? 422
                : 400;
        return json({ ok: false, code: result.code, error: result.message }, status, cors);
      }
      return json(result, 200, cors);
    }

    if (url.pathname === "/api/verify" && request.method === "POST") {
      // "I was there and this is still right" - a log entry and nothing
      // else. Same open access and the same attribution requirement as a
      // publish, because it makes the same kind of claim about a site.
      if (!fromAllowedOrigin(request, env)) {
        return json({ ok: false, error: "Ändringar tas bara emot från startvind.se." }, 403, cors);
      }

      const body = (await request.json().catch(() => null)) as VerifyRequest | null;
      if (!body || typeof body.path !== "string") {
        return json({ ok: false, error: "Malformed verify request." }, 400, cors);
      }

      const admin = (await requireSession(request, env)) !== null;
      const result = await verifySite(createGitHubGateway(githubConfig(env)), body, { admin });
      if (!result.ok) {
        const status =
          result.code === "conflict"
            ? 409
            : result.code === "upstream_error"
              ? 502
              : result.code === "unsigned"
                ? 422
                : 400;
        return json({ ok: false, code: result.code, error: result.message }, status, cors);
      }
      return json(result, 200, cors);
    }

    if (url.pathname === "/api/deployment") {
      // Unauthenticated, because the publish that produced the sha was.
      // A contributor who just saved must be able to watch their change
      // reach the live site; refusing to say would leave them staring at
      // a map that has not updated yet with no idea whether it worked.
      // It reports on public commits in a public repository.
      const sha = url.searchParams.get("sha");
      if (!sha) return json({ ok: false, error: "sha is required." }, 400, cors);
      const status = await deploymentStatus(githubConfig(env), sha);
      return json({ ok: true, ...status }, 200, cors);
    }

    return json({ ok: false, error: "Not found." }, 404, cors);
  }
}
