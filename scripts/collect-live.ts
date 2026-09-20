import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { isKnownProvider, resolveLiveSample } from "../src/providers/live/resolver.ts";
import type { SiteLiveSource } from "../src/providers/live/types.ts";
import type { WindSample } from "../src/domain/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "public/generated/live.json");

interface LiveEntry {
  status: "ok" | "unavailable" | "failed";
  sample: WindSample | null;
}

/**
 * Adapts a site's single `station` (§ FlyWeather Site Catalogue
 * Migration) back into the ordered array resolveLiveSample expects -
 * every site in the current catalogue has at most one station, so this
 * is always a 0- or 1-element array, never a lossy truncation.
 *
 * It DOES pass the url through now. It did not, and that was the whole
 * reason a club station could be saved, look complete in the editor and
 * in the file, and still never produce a reading: for a feed with no
 * directory behind it the URL is the only way to find the station at
 * all, and it was being dropped one function short of the reader.
 */
function stationAsSources(
  station:
    | { provider: string; station_id?: string | null; url?: string; name?: string; verified: boolean }
    | null
    | undefined,
): SiteLiveSource[] {
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

async function main() {
  const catalogue = buildCatalogue();
  const candidates = catalogue.sites.filter((s) => s.enabled && s.station);

  let sourcesOk = 0;
  let sourcesFailed = 0;
  const sites: Record<string, LiveEntry> = {};

  for (const site of candidates) {
    try {
      const sample = await resolveLiveSample(stationAsSources(site.station));
      if (sample) {
        sourcesOk++;
        sites[site.id] = { status: "ok", sample };
      } else {
        sourcesFailed++;
        sites[site.id] = { status: "unavailable", sample: null };
        // Naming the provider turns "something did not work" into a
        // one-line diagnosis: an unknown provider is a typo in a site
        // file, a known one is the source being down or having changed.
        const provider = site.station?.provider ?? "(none)";
        const known = site.station ? isKnownProvider(provider) : false;
        console.warn(
          `live collector: no usable source for "${site.id}" (provider "${provider}"${known ? "" : " - no reader for this provider"})`,
        );
      }
    } catch (err) {
      sourcesFailed++;
      sites[site.id] = { status: "failed", sample: null };
      console.warn(`live collector: "${site.id}" failed - ${(err as Error).message}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    liveCollector: {
      status: sourcesFailed === 0 ? "ok" : sourcesOk > 0 ? "partial" : "failed",
      sourcesOk,
      sourcesFailed,
    },
    sites,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Live collector: ${sourcesOk} ok, ${sourcesFailed} failed/unavailable -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
