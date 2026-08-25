import type { Env } from "./types";
import { siteDraftSchema, type SiteDraft } from "../src/domain/siteDraft";

const INDEX_KEY = "index";

export interface SiteSummary {
  id: string;
  name: string;
  status: SiteDraft["status"];
  updatedAt: string;
}

function siteKey(id: string): string {
  return `site:${id}`;
}

export async function readIndex(env: Env): Promise<SiteSummary[]> {
  const raw = await env.SITE_DRAFTS.get(INDEX_KEY);
  return raw ? (JSON.parse(raw) as SiteSummary[]) : [];
}

async function writeIndex(env: Env, index: SiteSummary[]): Promise<void> {
  await env.SITE_DRAFTS.put(INDEX_KEY, JSON.stringify(index));
}

export async function getSite(env: Env, id: string): Promise<SiteDraft | null> {
  const raw = await env.SITE_DRAFTS.get(siteKey(id));
  if (!raw) return null;
  return siteDraftSchema.parse(JSON.parse(raw));
}

async function upsertIndexEntry(env: Env, summary: SiteSummary): Promise<void> {
  const index = await readIndex(env);
  const next = index.filter((s) => s.id !== summary.id);
  next.push(summary);
  await writeIndex(env, next);
}

export async function putSite(env: Env, draft: SiteDraft): Promise<void> {
  await env.SITE_DRAFTS.put(siteKey(draft.id), JSON.stringify(draft));
  await upsertIndexEntry(env, {
    id: draft.id,
    name: draft.name,
    status: draft.status,
    updatedAt: draft.updatedAt,
  });
}

export async function deleteSite(env: Env, id: string): Promise<void> {
  await env.SITE_DRAFTS.delete(siteKey(id));
  const index = await readIndex(env);
  await writeIndex(
    env,
    index.filter((s) => s.id !== id),
  );
}
