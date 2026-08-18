import { describe, expect, it } from "vitest";
import { resolveLiveSample } from "../../src/providers/live/resolver.ts";
import type { LiveWindProvider, SiteLiveSource } from "../../src/providers/live/types.ts";
import type { WindSample } from "../../src/domain/types.ts";

function sample(sourceId: string): WindSample {
  return {
    sourceId,
    sourceKind: "observation",
    timestamp: new Date().toISOString(),
    windDirectionDeg: 225,
    windSpeedMs: 5,
    windGustMs: null,
  };
}

describe("resolveLiveSample (§18)", () => {
  it("uses the highest-priority source when it succeeds", async () => {
    const providers: Record<string, LiveWindProvider> = {
      primary: { fetch: async () => [sample("primary")] },
      secondary: { fetch: async () => [sample("secondary")] },
    };
    const sources: SiteLiveSource[] = [
      { provider: "secondary", priority: 2, verified: true },
      { provider: "primary", priority: 1, verified: true },
    ];
    const result = await resolveLiveSample(sources, providers);
    expect(result?.sourceId).toBe("primary");
  });

  it("falls back to the next priority when the top source throws", async () => {
    const providers: Record<string, LiveWindProvider> = {
      primary: {
        fetch: async () => {
          throw new Error("station offline");
        },
      },
      secondary: { fetch: async () => [sample("secondary")] },
    };
    const sources: SiteLiveSource[] = [
      { provider: "primary", priority: 1, verified: true },
      { provider: "secondary", priority: 2, verified: true },
    ];
    const result = await resolveLiveSample(sources, providers);
    expect(result?.sourceId).toBe("secondary");
  });

  it("falls back when the top source returns an empty result", async () => {
    const providers: Record<string, LiveWindProvider> = {
      primary: { fetch: async () => [] },
      secondary: { fetch: async () => [sample("secondary")] },
    };
    const sources: SiteLiveSource[] = [
      { provider: "primary", priority: 1, verified: true },
      { provider: "secondary", priority: 2, verified: true },
    ];
    const result = await resolveLiveSample(sources, providers);
    expect(result?.sourceId).toBe("secondary");
  });

  it("skips an unrecognized provider name rather than crashing", async () => {
    const providers: Record<string, LiveWindProvider> = {
      known: { fetch: async () => [sample("known")] },
    };
    const sources: SiteLiveSource[] = [
      { provider: "not-implemented-yet", priority: 1, verified: false },
      { provider: "known", priority: 2, verified: true },
    ];
    const result = await resolveLiveSample(sources, providers);
    expect(result?.sourceId).toBe("known");
  });

  it("returns null when every source fails or is unavailable", async () => {
    const providers: Record<string, LiveWindProvider> = {
      primary: { fetch: async () => [] },
    };
    const sources: SiteLiveSource[] = [{ provider: "primary", priority: 1, verified: true }];
    const result = await resolveLiveSample(sources, providers);
    expect(result).toBeNull();
  });

  it("returns null for an empty source list", async () => {
    expect(await resolveLiveSample([])).toBeNull();
  });
});
