import { bearerFrom, issueToken, passwordMatches, verifyToken } from "./auth.ts";
import { createGitHubGateway, deploymentStatus, type GitHubConfig } from "./github.ts";
import { publishSite, verifySite, type PublishRequest, type VerifyRequest } from "./publish.ts";
import { resolveLiveSample } from "../../src/providers/live/resolver.ts";
import { collectLiveSamples, type SiteWithStation } from "../../src/providers/live/collectLive.ts";

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

/**
 * Declared here rather than pulled in from @cloudflare/workers-types.
 *
 * This Worker's source is type-checked by the same tsconfig as the rest
 * of the repo, which targets the DOM lib - adding the Workers types
 * globally would redefine Request/Response/fetch for every file in the
 * project to no benefit. Two members are all this file uses.
 */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

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
  /** Where to read the published site catalogue from, for /api/live. Defaults to the live site. */
  SITE_BASE_URL?: string;
}

/**
 * How long a live-wind response is reused at the edge.
 *
 * Two minutes. The sources themselves update every five (Holfuy's
 * widget, Sjöbo's WeeWX archive) to sixty (an airport METAR), so this
 * gives a reader data that is essentially as current as the station
 * publishes, while capping what we ask of the providers at thirty
 * requests an hour per station no matter how many people are looking.
 *
 * Compare what it replaces: the build-time collector read each station
 * about seven times a DAY. This is not a load increase anyone will
 * notice at Startvind's traffic - and unlike a cron, it costs nothing at
 * all when nobody is using the site.
 */
const LIVE_CACHE_SECONDS = 120;
const CATALOGUE_CACHE_SECONDS = 600;

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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
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

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    if (url.pathname === "/api/live") {
      // Live wind, read from the stations on demand.
      //
      // live.json is still built and still deployed; this exists because
      // that file is only as fresh as the deploy, and the deploy runs
      // about seven times a day. A live reading goes stale in thirty
      // minutes, so most of the day every site fell back to forecast and
      // no station reading was visible at all - the delivery was the
      // bottleneck, not the stations.
      //
      // The response is byte-for-byte the same shape as live.json, so
      // the page treats this as the same data from a fresher place. If
      // this endpoint is unreachable the page falls back to the file,
      // which makes the worst case exactly the old behaviour.
      const cache = (caches as unknown as { default: Cache }).default;
      const cached = await cache.match(request);
      if (cached) return cached;

      const siteBase = (env.SITE_BASE_URL ?? "https://startvind.se").replace(/\/+$/, "");
      let sites: SiteWithStation[];
      try {
        const response = await fetch(`${siteBase}/generated/sites.json`, {
          cf: { cacheTtl: CATALOGUE_CACHE_SECONDS, cacheEverything: true },
        } as RequestInit);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        ({ sites } = (await response.json()) as { sites: SiteWithStation[] });
      } catch (err) {
        // No catalogue means no idea which stations to read. Saying so
        // lets the page keep using the file it already has rather than
        // showing nothing.
        return json(
          { ok: false, error: `Could not read the site catalogue. ${(err as Error).message}` },
          502,
          cors,
        );
      }

      const live = await collectLiveSamples(sites);
      const response = json(live, 200, {
        ...cors,
        "Cache-Control": `public, max-age=${LIVE_CACHE_SECONDS}`,
      });
      // Shared across every reader hitting this edge, so a busy morning
      // costs the providers no more than a quiet one.
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    }

    if (url.pathname === "/api/station-observation") {
      // The station finder's "does this actually work?" check.
      //
      // It exists because of CORS, not secrecy: SMHI and ViVa send
      // Access-Control-Allow-Origin:*, but the Aviation Weather Center,
      // Holfuy's widget and club WeeWX feeds do not, so a browser cannot
      // read three of the five sources at all. The Worker can, and it is
      // already the thing that talks to the outside world on this app's
      // behalf.
      //
      // Deliberately NOT a general fetch proxy. It takes a provider and
      // a station id, builds its own URLs, and any URL it is handed is
      // checked against the same allowlist the collector uses - the
      // readers are shared code, so there is one set of rules, not two.
      if (!fromAllowedOrigin(request, env)) {
        return json({ ok: false, error: "Not available from this origin." }, 403, cors);
      }

      const provider = url.searchParams.get("provider") ?? "";
      const stationId = url.searchParams.get("station_id");
      const stationUrl = url.searchParams.get("url");
      if (provider === "") return json({ ok: false, error: "provider is required." }, 400, cors);

      try {
        const sample = await resolveLiveSample([
          {
            provider,
            station_id: stationId,
            url: stationUrl,
            priority: 1,
            // Nothing here is verified, and this endpoint must never be
            // the thing that decides otherwise.
            verified: false,
          },
        ]);
        if (!sample) {
          return json(
            { ok: true, status: "unavailable", error: "The station did not return a usable wind reading." },
            200,
            { ...cors, "Cache-Control": "no-store" },
          );
        }
        // Cached briefly at the edge: several pilots comparing the same
        // few stations near one site should not each cost the upstream a
        // request, and a minute is well inside every source's own update
        // interval.
        return json({ ok: true, status: "ok", sample }, 200, { ...cors, "Cache-Control": "max-age=60" });
      } catch (err) {
        return json({ ok: true, status: "unavailable", error: (err as Error).message }, 200, {
          ...cors,
          "Cache-Control": "no-store",
        });
      }
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
