import type { GeneratedLiveFile, WindSample } from "../../domain/types.ts";
import type { SiteLiveSource } from "./types.ts";
import { resolveLiveSample } from "./resolver.ts";

/**
 * Reading every site's live station, in one place.
 *
 * Shared by the build-time collector (scripts/collect-live.ts) and by the
 * Worker's /api/live, so the two cannot drift into producing different
 * shapes for the same thing. The output IS GeneratedLiveFile - the format
 * the frontend has always read - which is what makes the Worker a
 * drop-in source rather than a second code path through the app.
 *
 * Why the Worker serves this at all: live.json is written at build time,
 * and the build runs when the deploy pipeline runs - measured at about
 * seven times a day, because GitHub's scheduler honours a
 * five-minute cron at roughly two-to-five-hour intervals. A live sample goes stale after 30
 * minutes, so for something like 85% of the day every site was falling
 * back to forecast and no station reading was visible at all. The
 * stations themselves update every few minutes; the delivery was the
 * bottleneck, not the data.
 */

export interface SiteWithStation {
  id: string;
  enabled?: boolean;
  station?: {
    provider: string;
    station_id?: string | null;
    url?: string;
    name?: string;
    verified: boolean;
  } | null;
}

/**
 * A site's single `station` as the ordered source list the resolver
 * takes. Every site has at most one today, so this is always a 0- or
 * 1-element array rather than a lossy truncation.
 *
 * The url is carried: for a club feed with no directory behind it, the
 * address is the only way to find the station at all.
 */
export function stationAsSources(station: SiteWithStation["station"]): SiteLiveSource[] {
  if (!station) return [];
  return [
    {
      provider: station.provider,
      station_id: station.station_id ?? undefined,
      url: station.url ?? undefined,
      name: station.name ?? undefined,
      priority: 1,
      verified: station.verified,
    },
  ];
}

export interface CollectOptions {
  /** How many stations to read at once. */
  concurrency?: number;
  /** Injected in tests; defaults to the real resolver. */
  resolve?: (sources: SiteLiveSource[]) => Promise<WindSample | null>;
  onSiteFailed?: (siteId: string, reason: string) => void;
}

/**
 * Reads every enabled site that has a station.
 *
 * Failures are per-site: one station being down, or naming a provider
 * nothing can read, leaves that site unavailable and every other site
 * unaffected. A live-wind feature that goes dark entirely because one
 * club's server is rebooting would be worse than no feature.
 */
export async function collectLiveSamples(
  sites: SiteWithStation[],
  options: CollectOptions = {},
): Promise<GeneratedLiveFile> {
  const resolve = options.resolve ?? resolveLiveSample;
  const concurrency = options.concurrency ?? 6;
  const candidates = sites.filter((s) => s.enabled !== false && s.station);

  const entries: GeneratedLiveFile["sites"] = {};
  let sourcesOk = 0;
  let sourcesFailed = 0;

  // A small pool rather than all at once: sixteen simultaneous scrapes
  // is not neighbourly to the providers, and rather than all in sequence,
  // which would make one slow station hold up every other.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (next < candidates.length) {
        const site = candidates[next++];
        try {
          const sample = await resolve(stationAsSources(site.station));
          if (sample) {
            sourcesOk++;
            entries[site.id] = { status: "ok", sample };
          } else {
            sourcesFailed++;
            entries[site.id] = { status: "unavailable", sample: null };
            options.onSiteFailed?.(site.id, `no usable source (provider "${site.station?.provider}")`);
          }
        } catch (err) {
          sourcesFailed++;
          entries[site.id] = { status: "failed", sample: null };
          options.onSiteFailed?.(site.id, (err as Error).message);
        }
      }
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    liveCollector: {
      status: sourcesFailed === 0 ? "ok" : sourcesOk > 0 ? "partial" : "failed",
      sourcesOk,
      sourcesFailed,
    },
    sites: entries,
  };
}
