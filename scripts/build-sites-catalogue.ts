import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { siteFileSchema, parseSitePath } from "../src/domain/siteFile.ts";
import type { Site, GeneratedSitesFile } from "../src/domain/sites.ts";

/**
 * Recursively discovers sites/**\/*.yaml, validates every file
 * independently (an error names the exact file), derives country/region/
 * group/enabled from each file's path, detects duplicate IDs globally,
 * and writes the same public/generated/sites.json shape the frontend has
 * always consumed (§ FlyWeather Site Catalogue Migration - replaces
 * scripts/parse-sites.ts's single fenced-YAML-block extraction from
 * SITES.md). Archived sites are still included with enabled:false,
 * mirroring SITES.md's own enabled:false sites exactly - moving a file
 * into/out of an archive/ folder is the direct equivalent of flipping
 * that old flag.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesRoot = resolve(repoRoot, "sites");
const outPath = resolve(repoRoot, "public/generated/sites.json");

// These have never varied across the project's lifetime - see
// SITE_MIGRATION_REPORT.md for why they became hardcoded constants here
// instead of a new standalone per-catalogue config file.
const DEFAULTS = {
  timezone: "Europe/Stockholm",
  units: "m/s",
  live_fresh_minutes: 10,
  live_stale_minutes: 30,
};
const SCHEMA_VERSION = 2;

function findYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findYamlFiles(full));
    } else if (entry.isFile() && extname(entry.name) === ".yaml") {
      out.push(full);
    }
  }
  return out;
}

function toPosixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

/** `root` defaults to the real repo sites/ directory; overridable so tests can point at a fixture directory instead. */
export function buildCatalogue(root: string = sitesRoot): GeneratedSitesFile {
  const files = findYamlFiles(root).sort();
  const sites: Site[] = [];
  const seenIds = new Map<string, string>();
  const errors: string[] = [];

  for (const file of files) {
    const rel = toPosixRelative(root, file);

    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(file, "utf-8"));
    } catch (err) {
      errors.push(`${rel}: failed to parse YAML - ${(err as Error).message}`);
      continue;
    }

    const result = siteFileSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${rel}: [${issue.path.join(".") || "(root)"}] ${issue.message}`);
      }
      continue;
    }

    let meta;
    try {
      meta = parseSitePath(rel);
    } catch (err) {
      errors.push(`${rel}: ${(err as Error).message}`);
      continue;
    }

    const parsed = result.data;
    const site: Site = {
      id: parsed.id,
      name: parsed.name,
      short_name: parsed.short_name,
      coordinates: parsed.coordinates,
      sector: parsed.sector,
      wind: parsed.wind,
      station: parsed.station,
      pilot_level: parsed.pilot_level,
      ridge_height_m: parsed.ridge_height_m,
      description: parsed.description,
      warnings: parsed.warnings,
      links: parsed.links,
      images: parsed.images,
      country: meta.country,
      region: meta.region,
      group: meta.group,
      enabled: !meta.archived,
    };

    const existing = seenIds.get(site.id);
    if (existing) {
      errors.push(`${rel}: duplicate site id "${site.id}" (already used by ${existing})`);
      continue;
    }
    seenIds.set(site.id, rel);
    sites.push(site);
  }

  if (errors.length > 0) {
    throw new Error(`sites catalogue has ${errors.length} error(s):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  }

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    defaults: DEFAULTS,
    sites,
  };
}

function main() {
  let output: GeneratedSitesFile;
  try {
    output = buildCatalogue();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  const enabledCount = output.sites.filter((s) => s.enabled).length;
  console.log(
    `sites catalogue validated OK: ${output.sites.length} sites (${enabledCount} active) -> ${outPath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
