import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useLiveData } from "../../src/app/useLiveData.ts";
import { collectLiveSamples } from "../../src/providers/live/collectLive.ts";
import type { GeneratedLiveFile, WindSample } from "../../src/domain/types.ts";
import type { PublishTarget } from "../../src/app/editorApi.ts";

const WORKER: PublishTarget = { kind: "worker", baseUrl: "https://worker.example" };

/**
 * Live wind reaches the page from the Worker, and falls back to the
 * file built at deploy time.
 *
 * The fallback is the whole safety argument for moving live wind off the
 * build: if the new path fails in any way, the page shows exactly what
 * it showed before. These tests exist to keep that true.
 */

function liveFile(over: Partial<GeneratedLiveFile> = {}): GeneratedLiveFile {
  return {
    generatedAt: "2026-09-20T16:00:00.000Z",
    liveCollector: { status: "ok", sourcesOk: 1, sourcesFailed: 0 },
    sites: {
      hammar: {
        status: "ok",
        sample: {
          sourceId: "holfuy",
          sourceKind: "observation",
          timestamp: "2026-09-20T16:00:00.000Z",
          windDirectionDeg: 240,
          windSpeedMs: 7,
          windGustMs: 9,
        },
      },
    },
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("where live wind comes from", () => {
  it("prefers the Worker, which reads the stations when asked", async () => {
    const fromWorker = liveFile({ generatedAt: "2026-09-20T16:30:00.000Z" });
    const spy = vi.fn(async (url: string) =>
      url.includes("/api/live") ? jsonResponse(fromWorker) : jsonResponse(liveFile()),
    );
    vi.stubGlobal("fetch", spy);

    const { result } = renderHook(() => useLiveData(WORKER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The bundled file is only as fresh as the last deploy - about seven
    // times a day - so it must not win when a live source is available.
    expect(result.current.source).toBe("live");
    expect(result.current.data?.generatedAt).toBe("2026-09-20T16:30:00.000Z");
  });

  it("falls back to the built file when the Worker cannot be reached", async () => {
    // The safety property: the worst case of the new path is the old
    // behaviour, never worse.
    const spy = vi.fn(async (url: string) => {
      if (url.includes("/api/live")) throw new Error("offline");
      return jsonResponse(liveFile());
    });
    vi.stubGlobal("fetch", spy);

    const { result } = renderHook(() => useLiveData(WORKER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.source).toBe("bundled");
    expect(result.current.data?.sites.hammar.status).toBe("ok");
    expect(result.current.error).toBeNull();
  });

  it("falls back when the Worker answers with something that is not a live file", async () => {
    // An error page that happens to parse as JSON must not replace real
    // readings with nothing.
    const spy = vi.fn(async (url: string) =>
      url.includes("/api/live") ? jsonResponse({ ok: false, error: "broken" }) : jsonResponse(liveFile()),
    );
    vi.stubGlobal("fetch", spy);

    const { result } = renderHook(() => useLiveData(WORKER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("bundled");
  });

  it("reports unavailability only when BOTH sources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const { result } = renderHook(() => useLiveData(WORKER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("keeps the reading on screen when a later refresh fails", async () => {
    // A momentary network blip must not blank a rose. Stale data clearly
    // labelled beats no data.
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        attempt++;
        if (attempt > 1) throw new Error("offline");
        return url.includes("/api/live") ? jsonResponse(liveFile()) : jsonResponse(liveFile());
      }),
    );

    const { result } = renderHook(() => useLiveData(WORKER));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    // Return from a hidden tab, which triggers an immediate refetch.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(result.current.data?.sites.hammar.status).toBe("ok");
  });
});

describe("reading every site's station", () => {
  const sites = [
    { id: "a", enabled: true, station: { provider: "holfuy", station_id: "1", verified: false } },
    { id: "b", enabled: true, station: { provider: "weewx", url: "https://x/y.json", verified: false } },
    { id: "c", enabled: true, station: null },
    { id: "d", enabled: false, station: { provider: "holfuy", station_id: "9", verified: false } },
  ];

  const sample: WindSample = {
    sourceId: "holfuy",
    sourceKind: "observation",
    timestamp: "2026-09-20T16:00:00.000Z",
    windDirectionDeg: 240,
    windSpeedMs: 7,
    windGustMs: null,
  };

  it("reads only enabled sites that have a station", async () => {
    const result = await collectLiveSamples(sites, { resolve: async () => sample });
    expect(Object.keys(result.sites).sort()).toEqual(["a", "b"]);
    expect(result.liveCollector).toMatchObject({ status: "ok", sourcesOk: 2, sourcesFailed: 0 });
  });

  it("isolates a failure to the site it happened to", async () => {
    // One club's server rebooting must not take live wind down for every
    // other site.
    const result = await collectLiveSamples(sites, {
      resolve: async (sources) => {
        if (sources[0].provider === "weewx") throw new Error("upstream down");
        return sample;
      },
    });
    expect(result.sites.a.status).toBe("ok");
    expect(result.sites.b.status).toBe("failed");
    expect(result.liveCollector.status).toBe("partial");
  });

  it("carries the station URL to the reader", async () => {
    const seen: (string | null | undefined)[] = [];
    await collectLiveSamples(sites, {
      resolve: async (sources) => {
        seen.push(sources[0].url);
        return sample;
      },
    });
    expect(seen).toContain("https://x/y.json");
  });

  it("says so plainly when nothing could be read", async () => {
    const result = await collectLiveSamples(sites, { resolve: async () => null });
    expect(result.liveCollector.status).toBe("failed");
    expect(result.sites.a.status).toBe("unavailable");
  });
});
