import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchWeatherRefresh, REFRESH_EVENT_TYPE } from "../../editor-worker/src/dispatch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const CONFIG = {
  owner: "Utskottet",
  repo: "FlyWeather",
  branch: "main",
  token: "test-token-not-a-real-one",
  userAgent: "startvind-editor-worker",
};

interface Call {
  url: string;
  init: RequestInit;
}

/** Records every request and answers with whatever the test wants to see. */
function stubFetch(response: () => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dispatchWeatherRefresh", () => {
  it("POSTs a repository_dispatch naming the agreed event type", async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }));

    await dispatchWeatherRefresh(CONFIG);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/repos/Utskottet/FlyWeather/dispatches");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ event_type: REFRESH_EVENT_TYPE });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token-not-a-real-one");
    expect(headers["User-Agent"]).toBe(CONFIG.userAgent);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("surfaces GitHub's real error rather than pretending it worked", async () => {
    // 204 is the only success. A 403 - the token lacking "Contents: write"
    // - must reach the caller, because in the scheduled path it is the only
    // signal that the clock has quietly stopped.
    stubFetch(() => new Response("Resource not accessible by personal access token", { status: 403 }));

    await expect(dispatchWeatherRefresh(CONFIG)).rejects.toThrow(/403/);
  });

  it("keeps the event name in step with the workflow that listens for it", () => {
    // The one failure that cannot be caught at runtime: the Worker
    // dispatches an event the workflow does not subscribe to, and the
    // refresh silently stops. Reading the workflow here makes a rename in
    // one place and not the other fail a test instead.
    const workflow = readFileSync(resolve(repoRoot, ".github/workflows/weather-refresh.yml"), "utf-8");
    expect(workflow).toContain("repository_dispatch");
    expect(workflow).toContain(REFRESH_EVENT_TYPE);
  });
});
