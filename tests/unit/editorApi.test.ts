import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentSession,
  deploymentStatus,
  publish,
  readSessionToken,
  resolvePublishTarget,
  signIn,
  signOut,
  verify,
  repoHead,
  type PublishInput,
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
  const input: PublishInput = {
    path: "se/skane/ridge/x.yaml",
    fields: { id: "x", last_edited_by: "Edvin Buregren" },
    contributor: { name: "Edvin Buregren", club: "Club Parapente Syd", affirmed: true, trap: "" },
  };

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

  it("publishes with no session at all - editing is open", async () => {
    // The point of the whole attribution change: a pilot who has never
    // signed in to anything can still correct a site.
    const spy = mockFetch(() => jsonResponse({ ok: true, commitSha: "deadbeef" }));
    const result = await publish(input, WORKER);

    expect(result).toMatchObject({ ok: true, kind: "worker", commitSha: "deadbeef" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sends the contributor with the save, since that is what stands in for a password", async () => {
    const spy = mockFetch(() => jsonResponse({ ok: true, commitSha: "deadbeef" }));
    await publish(input, WORKER);
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)) as PublishInput;
    expect(body.contributor).toMatchObject({ name: "Edvin Buregren", affirmed: true });
  });

  it("sends an admin session as a bearer token when there is one, never a cookie", async () => {
    // Not required to publish - it only marks the change as an admin's in
    // the edit log.
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

  it("clears an expired admin session rather than letting it keep failing", async () => {
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

  it("distinguishes a save that changed nothing, which is not an error to apologise for", async () => {
    mockFetch(() => jsonResponse({ ok: false, code: "no_change", error: "Ingenting har ändrats." }, 400));
    expect(await publish(input, WORKER)).toMatchObject({ ok: false, code: "no_change" });
  });

  it("never throws on a network failure - a lost draft is the worst outcome here", async () => {
    window.sessionStorage.setItem("startvind-editor-session", "tok.sig");
    mockFetch(() => {
      throw new Error("offline");
    });
    expect(await publish(input, WORKER)).toMatchObject({ ok: false, code: "network" });
  });
});

describe("verify", () => {
  const input = {
    path: "se/skane/ridge/x.yaml",
    contributor: { name: "Edvin Buregren", club: "Club Parapente Syd", affirmed: true, trap: "" },
  };

  it("posts the confirmation with no session required", async () => {
    const spy = mockFetch(() => jsonResponse({ ok: true, commitSha: "deadbeef" }));
    expect(await verify(input, WORKER)).toMatchObject({ ok: true, commitSha: "deadbeef" });
    expect(String(spy.mock.calls[0][0])).toBe("https://worker.example/api/verify");
  });

  it("says it cannot rather than pretending, when there is no Worker to log to", async () => {
    // A button that silently does nothing is worse than one that admits
    // it has nowhere to write.
    const spy = mockFetch(() => jsonResponse({ ok: true }));
    expect(await verify(input, LOCAL)).toMatchObject({ ok: false, code: "not_configured" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports a refused signature without throwing", async () => {
    mockFetch(() => jsonResponse({ ok: false, error: "Kryssa i båda rutorna." }, 422));
    expect(await verify(input, WORKER)).toMatchObject({ ok: false, code: "rejected" });
  });
});

describe("repoHead", () => {
  it("reads the head from the unauthenticated health endpoint", async () => {
    const spy = mockFetch(() => jsonResponse({ ok: true, headSha: "abc123" }));
    expect(await repoHead(WORKER)).toBe("abc123");
    expect(String(spy.mock.calls[0][0])).toBe("https://worker.example/api/health");
  });

  it("is undefined rather than an error when the Worker cannot say", async () => {
    // Not knowing the head is not a failure: the commit-time
    // compare-and-swap still catches a genuine race.
    mockFetch(() => jsonResponse({ ok: false }, 500));
    expect(await repoHead(WORKER)).toBeUndefined();

    mockFetch(() => {
      throw new Error("offline");
    });
    expect(await repoHead(WORKER)).toBeUndefined();
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
