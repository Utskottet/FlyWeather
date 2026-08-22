import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { legacySitesDataSchema, extractYamlBlock } from "../src/domain/legacySites.ts";

/**
 * SUPERSEDED (§ FlyWeather Site Catalogue Migration) - the active build
 * pipeline now uses scripts/build-sites-catalogue.ts, which reads
 * sites/**\/*.yaml instead of this file's single fenced SITES.md block.
 * Kept only for rollback safety per the migration's staged-commit plan;
 * not wired into `npm run dev`/`build` anymore. Writes to a clearly
 * separate `sites.legacy.json` output so an accidental manual run can
 * never overwrite the real generated catalogue.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesMdPath = resolve(repoRoot, "SITES.md");
const outPath = resolve(repoRoot, "public/generated/sites.legacy.json");

function main() {
  const markdown = readFileSync(sitesMdPath, "utf-8");
  const yamlText = extractYamlBlock(markdown);

  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    console.error(`SITES.md YAML block failed to parse: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = legacySitesDataSchema.safeParse(raw);
  if (!result.success) {
    console.error(`SITES.md failed schema validation (${result.error.issues.length} issue(s)):\n`);
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      console.error(`  - [${path}] ${issue.message}`);
    }
    process.exit(1);
  }

  const enabledCount = result.data.sites.filter((s) => s.enabled).length;
  const output = {
    generatedAt: new Date().toISOString(),
    schemaVersion: result.data.schema_version,
    defaults: result.data.defaults,
    sites: result.data.sites,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(
    `SITES.md validated OK: ${result.data.sites.length} sites (${enabledCount} enabled) -> ${outPath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
