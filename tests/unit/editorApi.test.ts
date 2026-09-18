import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentSession,
  deploymentStatus,
  publish,
  readSessionToken,
  resolvePublishTarget,
  signIn,
  signOut,
  type PublishTarget,
} from "../../src/app/editorApi.ts";

const WORKER: PublishTarget = { kind: "worker", baseUrl: "https://worker.example" };
const LOCAL: PublishTarget = { kind: "local" };

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePublishTarget", () => {
  it("prefers a configured Worker, even in dev, so the real path can be exercised locally", () => {
    expect(resolvePublishTarget("https://worker.example", true)).toEqual(WORKER);
    expect(resolvePublishTarget("https://worker.example", false)).toEqual(WORKER);
  });

  it("trims trailing slashes so URLs never double up", () => {
    expect(resolvePublishTarget("https://worker.example///", false)).toEqual(WORKER);
  });

  it("falls back to the local dev server when no Worker is configured", () => {
    expect(resolvePublishTarget(undefined, true)).toEqual(LOCAL);
    expect(resolvePublishTarget("   ", true)).toEqual(LOCAL);
  });

  it("is null in a built copy with no Worker - nothing there could accept a save", () => {
    expect(resolvePublishTarget(undefined, false)).toBeNull();
    expect(resolvePublishTarget("", false)).toBeNull();
  });
});

describe("signIn", () => {
  it("stores the issued session token and never the password", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ ok: true, token: "tok.sig", expiresAt: "2030-01-01T00:00:00Z" }));
    const result = await signIn("hunter2", WORKER);

    expect(result.ok).toBe(true);
    expect(readSessionToken()).toBe("tok.sig");
    const stored = JSON.stringify(window.sessionStorage);
    expect(stored).not.toContain("hunter2");
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://worker.example/api/login");
  });

  it("reports the Worker's message on a bad password and stores nothing", async () => {
    mockFetch(() => jsonResponse({ ok: false, error: "Incorrect password." }, 401));
    const result = await signIn("wrong", WORKER);
    expect(result).toEqual({ ok: false, message: "Incorrect password." });
    expect(readSessionToken()).toBeNull();
  });

  it("reports a reachability problem rather than throwing", async () => {
    mockFetch(() => {
      throw new Error("Failed to fetch");
    });
    const result = await signIn("x", WORKER);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Could not reach");
  });
});

describe("currentSession", () => {
  it("returns the operator and the head to base an edit on", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => jsonResponse({ ok: true, sub: "edvin", headSha: "abc123" }));
    expect(await currentSession(WORKER)).toEqual({ sub: "edvin", headSha: "abc123" });
  });

  it("discards a token the Worker rejects, so it cannot keep failing", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "expired");
    mockFetch(() => jsonResponse({ ok: false }, 401));
    expect(await currentSession(WORKER)).toBeNull();
    expect(readSessionToken()).toBeNull();
  });

  it("is null with no token, without calling the network", async () => {
    const spy = mockFetch(() => jsonResponse({}));
    expect(await currentSession(WORKER)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("publish", () => {
  const input = { path: "se/skane/ridge/x.yaml", fields: { id: "x", last_edited_by: "Edvin Buregren" } };

  it("refuses when nothing is configured to accept a save", async () => {
    const result = await publish(input, null);
    expect(result).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("posts to the local dev endpoint in local mode", async () => {
    const spy = mockFetch(() => jsonResponse({ ok: true }));
    const result = await publish(input, LOCAL);
    expect(result).toMatchObject({ ok: true, kind: "local" });
    expect(String(spy.mock.calls[0][0])).toBe("/api/site");
  });

  it("requires a session before it will call the Worker", async () => {
    const spy = mockFetch(() => jsonResponse({ ok: true }));
    const result = await publish(input, WORKER);
    expect(result).toMatchObject({ ok: false, code: "unauthorised" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the session as a bearer token, never a cookie", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    const spy = mockFetch(() => jsonResponse({ ok: true, commitSha: "deadbeef" }));
    const result = await publish(input, WORKER);

    expect(result).toMatchObject({ ok: true, kind: "worker", commitSha: "deadbeef" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok.sig");
    expect(init.credentials).toBeUndefined();
  });

  it("surfaces a conflict distinctly, so the editor can offer a reload", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => jsonResponse({ ok: false, error: "Someone else published." }, 409));
    const result = await publish(input, WORKER);
    expect(result).toMatchObject({ ok: false, code: "conflict" });
  });

  it("clears an expired session so the next attempt asks for a password", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "expired");
    mockFetch(() => jsonResponse({ ok: false }, 401));
    const result = await publish(input, WORKER);
    expect(result).toMatchObject({ ok: false, code: "unauthorised" });
    expect(readSessionToken()).toBeNull();
  });

  it("separates an upstream failure from a rejected edit", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => jsonResponse({ ok: false, error: "GitHub is down" }, 502));
    expect(await publish(input, WORKER)).toMatchObject({ ok: false, code: "upstream" });

    mockFetch(() => jsonResponse({ ok: false, error: "id must match filename" }, 400));
    expect(await publish(input, WORKER)).toMatchObject({ ok: false, code: "rejected" });
  });

  it("never throws on a network failure - a lost draft is the worst outcome here", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => {
      throw new Error("offline");
    });
    expect(await publish(input, WORKER)).toMatchObject({ ok: false, code: "network" });
  });
});

describe("deploymentStatus", () => {
  it("reports the Worker's view of the deploy", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => jsonResponse({ ok: true, state: "building", detail: "Deploy in progress." }));
    expect(await deploymentStatus("abc", WORKER)).toMatchObject({ state: "building" });
  });

  it("says the publish still succeeded when only the status read fails", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => {
      throw new Error("offline");
    });
    const status = await deploymentStatus("abc", WORKER);
    expect(status.state).toBe("unknown");
    expect(status.detail).toContain("Published");
  });

  it("has nothing to track for a local save", async () => {
    expect(await deploymentStatus("abc", LOCAL)).toMatchObject({ state: "unknown" });
  });
});

describe("signOut", () => {
  it("removes the stored session", () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    signOut();
    expect(readSessionToken()).toBeNull();
  });
});
