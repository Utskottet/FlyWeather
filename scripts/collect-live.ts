import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import { collectLiveSamples } from "../src/providers/live/collectLive.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "public/generated/live.json");

/**
 * Writes public/generated/live.json at build time.
 *
 * Still here, and still the fallback the website uses when no Worker is
 * configured - but no longer the primary path for a deployed site. The
 * build runs about seven times a day (GitHub honours a five-minute
 * cron at two-to-five-hour intervals), and a live reading goes stale in thirty
 * minutes, so this alone left every site showing forecast for most of
 * the day. The Worker's /api/live reads the same stations on demand;
 * this file is what the page falls back to when that is unreachable,
 * which makes the worst case exactly the old behaviour.
 *
 * The reading itself is shared code (domain-side collectLiveSamples), so
 * the file and the endpoint cannot produce different shapes.
 */
async function main() {
  const catalogue = buildCatalogue();

  const output = await collectLiveSamples(catalogue.sites, {
    onSiteFailed: (siteId, reason) => console.warn(`live collector: ${siteId} - ${reason}`),
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(
    `Live collector: ${output.liveCollector.sourcesOk} ok, ${output.liveCollector.sourcesFailed} failed/unavailable -> ${outPath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
