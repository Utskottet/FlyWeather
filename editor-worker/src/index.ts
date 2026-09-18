import { bearerFrom, issueToken, passwordMatches, verifyToken } from "./auth.ts";
import { createGitHubGateway, deploymentStatus, type GitHubConfig } from "./github.ts";
import { publishSite, type PublishRequest } from "./publish.ts";

/**
 * Startvind's publishing Worker.
 *
 * The public website stays exactly what it was - static files on GitHub
 * Pages, with the repository as the single source of truth. This Worker
 * exists only so the editor on that website can write to the repository
 * without the browser ever holding a GitHub credential: the browser
 * authenticates to the Worker, and the Worker alone holds the token that
 * can commit.
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
  /** Shared password for the single operator. Secret. */
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
      return json(
        { ok: true, repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch: env.GITHUB_BRANCH || "main" },
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
      const sub = await requireSession(request, env);
      if (!sub) return json({ ok: false, error: "Sign in to publish." }, 401, cors);

      const body = (await request.json().catch(() => null)) as PublishRequest | null;
      if (!body || typeof body.path !== "string" || typeof body.fields !== "object" || body.fields === null) {
        return json({ ok: false, error: "Malformed publish request." }, 400, cors);
      }

      const result = await publishSite(createGitHubGateway(githubConfig(env)), body);
      if (!result.ok) {
        const status = result.code === "conflict" ? 409 : result.code === "upstream_error" ? 502 : 400;
        return json({ ok: false, code: result.code, error: result.message }, status, cors);
      }
      return json(result, 200, cors);
    }

    if (url.pathname === "/api/deployment") {
      const sub = await requireSession(request, env);
      if (!sub) return json({ ok: false, error: "Sign in first." }, 401, cors);
      const sha = url.searchParams.get("sha");
      if (!sha) return json({ ok: false, error: "sha is required." }, 400, cors);
      const status = await deploymentStatus(githubConfig(env), sha);
      return json({ ok: true, ...status }, 200, cors);
    }

    return json({ ok: false, error: "Not found." }, 404, cors);
  }
}
