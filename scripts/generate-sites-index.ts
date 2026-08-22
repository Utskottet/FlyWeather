import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { buildCatalogue } from "./build-sites-catalogue.ts";
import type { Site } from "../src/domain/sites.ts";

/**
 * Generates human-facing overview files from the sites/**\/*.yaml
 * catalogue (§ FlyWeather Site Catalogue Migration) - sites-index.csv and
 * SITES_INDEX.md. Generated views only; the YAML files remain
 * authoritative. Re-run any time the catalogue changes (also wired into
 * `npm run dev`/`build`, see package.json's `sites:index` script).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const csvOutPath = resolve(repoRoot, "sites-index.csv");
const mdOutPath = resolve(repoRoot, "SITES_INDEX.md");

function sectorDegrees(site: Site): string {
  return site.sector ? `${site.sector.from_deg}–${site.sector.to_deg}` : "";
}

function stationLabel(site: Site): string {
  if (!site.station) return "";
  return site.station.name ?? `${site.station.provider}${site.station.station_id ? ` #${site.station.station_id}` : ""}`;
}

function sortKey(site: Site): string {
  return [site.country, site.region, site.group ?? "zzz-archive", site.name].join("");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const COLUMNS = [
  "active",
  "country",
  "region",
  "group",
  "short_name",
  "name",
  "sector_degrees",
  "station",
  "pilot_level",
  "coordinates_verified",
  "sector_verified",
] as const;

function rowFor(site: Site): Record<(typeof COLUMNS)[number], string> {
  return {
    active: site.enabled ? "yes" : "no",
    country: site.country,
    region: site.region,
    group: site.group ?? "",
    short_name: site.short_name ?? "",
    name: site.name,
    sector_degrees: sectorDegrees(site),
    station: stationLabel(site),
    pilot_level: site.pilot_level ?? "",
    coordinates_verified: site.coordinates.verified ? "yes" : "no",
    sector_verified: site.sector ? (site.sector.verified ? "yes" : "no") : "",
  };
}

function main() {
  const catalogue = buildCatalogue();
  const sites = [...catalogue.sites].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const rows = sites.map(rowFor);

  // --- CSV ---
  const csvLines = [COLUMNS.join(",")];
  for (const row of rows) {
    csvLines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
  }
  writeFileSync(csvOutPath, csvLines.join("\n") + "\n", "utf-8");

  // --- Markdown ---
  const mdLines: string[] = [];
  mdLines.push("# Sites Index");
  mdLines.push("");
  mdLines.push(
    "Generated from `sites/**/*.yaml` by `scripts/generate-sites-index.ts`. This is a generated view for " +
      "humans, not authoritative - edit the YAML files under `sites/`, then re-run `npm run sites:index`.",
  );
  mdLines.push("");
  mdLines.push(`${sites.length} sites total, ${sites.filter((s) => s.enabled).length} active.`);
  mdLines.push("");
  mdLines.push(
    "| Active | Country | Region | Group | Short name | Full name | Sector (deg) | Station | Pilot level | Coords verified | Sector verified |",
  );
  mdLines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    mdLines.push(
      `| ${row.active} | ${row.country} | ${row.region} | ${row.group} | ${row.short_name} | ${row.name} | ${row.sector_degrees} | ${row.station} | ${row.pilot_level} | ${row.coordinates_verified} | ${row.sector_verified} |`,
    );
  }
  mdLines.push("");
  writeFileSync(mdOutPath, mdLines.join("\n"), "utf-8");

  console.log(`sites index: wrote ${csvOutPath} and ${mdOutPath} (${sites.length} sites)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
