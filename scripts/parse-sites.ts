import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { sitesDataSchema } from "../src/domain/sites.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesMdPath = resolve(repoRoot, "SITES.md");
const outPath = resolve(repoRoot, "public/generated/sites.json");

export function extractYamlBlock(markdown: string): string {
  const match = markdown.match(/```yaml\n([\s\S]*?)```/);
  if (!match) {
    throw new Error("No fenced ```yaml block found");
  }
  return match[1];
}

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

  const result = sitesDataSchema.safeParse(raw);
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
