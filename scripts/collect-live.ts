import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { sitesDataSchema } from "../src/domain/sites.ts";
import { extractYamlBlock } from "./parse-sites.ts";
import { resolveLiveSample } from "../src/providers/live/resolver.ts";
import type { WindSample } from "../src/domain/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesMdPath = resolve(repoRoot, "SITES.md");
const outPath = resolve(repoRoot, "public/generated/live.json");

interface LiveEntry {
  status: "ok" | "unavailable" | "failed";
  sample: WindSample | null;
}

async function main() {
  const markdown = readFileSync(sitesMdPath, "utf-8");
  const raw = parseYaml(extractYamlBlock(markdown));
  // SITES.md's schema is already enforced by `npm run validate:sites`
  // earlier in the pipeline; re-parsing here is cheap and keeps this
  // script runnable standalone too.
  const parsed = sitesDataSchema.parse(raw);

  const candidates = parsed.sites.filter((s) => s.enabled && s.live_sources.length > 0);

  let sourcesOk = 0;
  let sourcesFailed = 0;
  const sites: Record<string, LiveEntry> = {};

  for (const site of candidates) {
    try {
      const sample = await resolveLiveSample(site.live_sources);
      if (sample) {
        sourcesOk++;
        sites[site.id] = { status: "ok", sample };
      } else {
        sourcesFailed++;
        sites[site.id] = { status: "unavailable", sample: null };
        console.warn(`live collector: no usable source for "${site.id}"`);
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
