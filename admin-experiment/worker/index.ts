import type { Env } from "./types";
import { verifyPassword, createSessionCookie, clearSessionCookie, requireSession } from "./auth";
import { readIndex, getSite, putSite, deleteSite } from "./kv";
import { siteDraftInputSchema } from "../src/domain/siteDraft";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/login" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { password?: string } | null;
    if (!body?.password || !(await verifyPassword(body.password, env))) {
      return json({ error: "invalid password" }, { status: 401 });
    }
    return json({ ok: true }, { headers: { "Set-Cookie": await createSessionCookie(env) } });
  }

  if (path === "/api/logout" && request.method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  }

  if (!(await requireSession(request, env))) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  if (path === "/api/sites" && request.method === "GET") {
    return json(await readIndex(env));
  }

  if (path === "/api/sites" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const parsed = siteDraftInputSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, { status: 400 });
    const now = new Date().toISOString();
    const draft = { ...parsed.data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await putSite(env, draft);
    return json(draft, { status: 201 });
  }

  const siteMatch = path.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch) {
    const id = decodeURIComponent(siteMatch[1]);

    if (request.method === "GET") {
      const site = await getSite(env, id);
      return site ? json(site) : json({ error: "not found" }, { status: 404 });
    }

    if (request.method === "PUT") {
      const existing = await getSite(env, id);
      if (!existing) return json({ error: "not found" }, { status: 404 });
      const body = await request.json().catch(() => null);
      const parsed = siteDraftInputSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, { status: 400 });
      const draft = { ...parsed.data, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
      await putSite(env, draft);
      return json(draft);
    }

    if (request.method === "DELETE") {
      await deleteSite(env, id);
      return json({ ok: true });
    }
  }

  const statusMatch = path.match(/^\/api\/sites\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const id = decodeURIComponent(statusMatch[1]);
    const existing = await getSite(env, id);
    if (!existing) return json({ error: "not found" }, { status: 404 });
    const body = (await request.json().catch(() => null)) as { status?: "active" | "hidden" } | null;
    if (body?.status !== "active" && body?.status !== "hidden") {
      return json({ error: "status must be 'active' or 'hidden'" }, { status: 400 });
    }
    const draft = { ...existing, status: body.status, updatedAt: new Date().toISOString() };
    await putSite(env, draft);
    return json(draft);
  }

  return json({ error: "not found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }
    return env.ASSETS.fetch(request);
  },
};
