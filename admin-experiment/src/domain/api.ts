import type { SiteDraft, SiteDraftInput } from "./siteDraft";
import type { SiteSummary } from "../../worker/kv";

class UnauthorizedError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 401) {
    if (!location.pathname.endsWith("/login")) location.assign("/login");
    throw new UnauthorizedError("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (password: string) => request<{ ok: true }>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  listSites: () => request<SiteSummary[]>("/api/sites"),
  getSite: (id: string) => request<SiteDraft>(`/api/sites/${encodeURIComponent(id)}`),
  createSite: (input: SiteDraftInput) => request<SiteDraft>("/api/sites", { method: "POST", body: JSON.stringify(input) }),
  updateSite: (id: string, input: SiteDraftInput) =>
    request<SiteDraft>(`/api/sites/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  setStatus: (id: string, status: "active" | "hidden") =>
    request<SiteDraft>(`/api/sites/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteSite: (id: string) => request<{ ok: true }>(`/api/sites/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
