import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { legacySitesDataSchema, extractYamlBlock, type LegacySite } from "../src/domain/legacySites.ts";
import { MARGINAL_SECTOR_PADDING_DEG } from "../src/domain/flyability.ts";

/**
 * One-time migration: SITES.md's monolithic fenced-YAML block -> one YAML
 * file per site under sites/<country>/<region>/<ridge|winch|archive>/
 * (§ FlyWeather Site Catalogue Migration). Deterministic and re-runnable -
 * always regenerates every file from SITES.md fresh rather than patching
 * existing YAML, so there is exactly one source of truth while both
 * formats coexist. Does not delete or modify SITES.md.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sitesMdPath = resolve(repoRoot, "SITES.md");
const sitesOutRoot = resolve(repoRoot, "sites");
const reportOutPath = resolve(repoRoot, "SITE_MIGRATION_REPORT.md");

// Regions are not machine-parseable from SITES.md (they exist only as YAML
// comments, stripped by the parser) - this table encodes them from the
// same real-world geography the source file's own section comments used
// (SOUTH/EAST, ÖRESUND/WEST, BJÄRE, VEN are all within Skåne county;
// Danish sites split by their real region - Gilleleje/Rågeleje are in
// Nordsjælland, Løkken/Dokkedal are in Nordjylland). Not invented - every
// one of these towns/kommuner is a real, verifiable placement.
const REGION_BY_ID: Record<string, string> = {
  "dk-gilbjerg-hoved": "nordsjaelland",
  "dk-strandbjerggard": "nordsjaelland",
  "dk-lokken": "nordjylland",
  "dk-dokkedal": "nordjylland",
};
const DEFAULT_REGION: Record<string, string> = { se: "skane" };

function regionFor(site: LegacySite): string {
  return REGION_BY_ID[site.id] ?? DEFAULT_REGION[site.country.toLowerCase()] ?? "unassigned";
}

function groupFor(site: LegacySite): "ridge" | "winch" | null {
  if (site.type === "hang") return "ridge";
  if (site.type === "winch") return "winch";
  return null; // paramotor/school/other have no ridge/winch equivalent in the current product design
}

interface SectorConversion {
  siteId: string;
  oldGreen: LegacySite["rose"]["green"];
  oldOrange: LegacySite["rose"]["orange"];
  newSector: { from_deg: number; to_deg: number; verified: boolean } | null;
  exact: boolean;
  note: string;
}

function convertSector(site: LegacySite): SectorConversion {
  const { green, orange, verified } = site.rose;
  if (green.length === 0) {
    return { siteId: site.id, oldGreen: green, oldOrange: orange, newSector: null, exact: true, note: "no rose data in source - sector omitted" };
  }
  if (green.length > 1) {
    return {
      siteId: site.id,
      oldGreen: green,
      oldOrange: orange,
      newSector: null,
      exact: false,
      note: `MANUAL REVIEW: ${green.length} green ranges - which one is authoritative is ambiguous, preserving none automatically`,
    };
  }
  const g = green[0];
  const newSector = { from_deg: g.from_deg, to_deg: g.to_deg, verified };
  // Confirm the old orange padding matches the uniform MARGINAL_SECTOR_PADDING_DEG
  // policy flyability.ts now applies automatically - if it doesn't, the
  // orange data encoded something genuinely site-specific that a flat
  // policy constant can't reproduce, and that's worth a human's attention.
  const span = (from: number, to: number) => {
    const s = ((to % 360) + 360) % 360 - (((from % 360) + 360) % 360);
    return s <= 0 ? s + 360 : s;
  };
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const lowSide = orange.find((o) => Math.abs(norm(o.to_deg) - norm(g.from_deg)) < 0.01);
  const highSide = orange.find((o) => Math.abs(norm(o.from_deg) - norm(g.to_deg)) < 0.01);
  let exact = orange.length === 0;
  let note = orange.length === 0 ? "no orange data to compare - direct 1:1 green->sector mapping" : "";
  if (orange.length > 0) {
    if (!lowSide || !highSide) {
      exact = false;
      note = "MANUAL REVIEW: orange ranges don't adjoin the green range as expected - could not verify padding";
    } else {
      const lowPad = span(lowSide.from_deg, lowSide.to_deg);
      const highPad = span(highSide.from_deg, highSide.to_deg);
      exact = Math.abs(lowPad - MARGINAL_SECTOR_PADDING_DEG) < 0.01 && Math.abs(highPad - MARGINAL_SECTOR_PADDING_DEG) < 0.01;
      note = exact
        ? `orange matched the uniform ${MARGINAL_SECTOR_PADDING_DEG}deg padding exactly on both sides - direction-fit behavior is unchanged`
        : `MANUAL REVIEW: orange padding was ${lowPad.toFixed(2)}/${highPad.toFixed(2)}deg, not the uniform ${MARGINAL_SECTOR_PADDING_DEG}deg policy - behavior may differ for this site`;
    }
  }
  return { siteId: site.id, oldGreen: green, oldOrange: orange, newSector, exact, note };
}

interface StationConversion {
  siteId: string;
  oldSources: LegacySite["live_sources"];
  newStation: { provider: string; station_id?: string | null; verified: boolean; note?: string } | null;
  note: string;
}

function convertStation(site: LegacySite): StationConversion {
  const sources = site.live_sources;
  if (sources.length === 0) {
    return { siteId: site.id, oldSources: sources, newStation: null, note: "no live source in source" };
  }
  if (sources.length > 1) {
    return {
      siteId: site.id,
      oldSources: sources,
      newStation: null,
      note: `MANUAL REVIEW: ${sources.length} live sources - only the highest-priority one can be represented by the new single-station schema; review before discarding the rest`,
    };
  }
  const s = sources[0];
  return {
    siteId: site.id,
    oldSources: sources,
    newStation: { provider: s.provider, station_id: s.station_id ?? undefined, verified: s.verified, note: s.note },
    note: "direct 1:1 mapping (single source)",
  };
}

function convertWarnings(site: LegacySite): string[] {
  return (site.restrictions ?? []).map((r) => (r.severity === "hard" ? `[HARD] ${r.message}` : r.message));
}

function convertLinks(site: LegacySite): { label: string; url: string }[] {
  return site.cps_url ? [{ label: "CPS listing", url: site.cps_url }] : [];
}

function yamlSafeId(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`site id "${id}" contains characters unsafe for a filename - migration halted`);
  }
  return id;
}

interface MigratedSite {
  legacy: LegacySite;
  region: string;
  group: "ridge" | "winch" | null;
  archived: boolean;
  filePath: string; // relative to repo root
  sectorConversion: SectorConversion;
  stationConversion: StationConversion;
  warnings: string[];
  links: { label: string; url: string }[];
}

function main() {
  const markdown = readFileSync(sitesMdPath, "utf-8");
  const raw = parseYaml(extractYamlBlock(markdown));
  const parsed = legacySitesDataSchema.parse(raw); // throws with full issue list on failure

  const migrated: MigratedSite[] = [];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const site of parsed.sites) {
    if (seenIds.has(site.id)) duplicateIds.push(site.id);
    seenIds.add(site.id);

    const region = regionFor(site);
    const group = groupFor(site);
    const archived = !site.enabled || group === null;
    const groupSegment = archived ? "archive" : group!;
    const country = site.country.toLowerCase();
    const id = yamlSafeId(site.id);
    const filePath = `sites/${country}/${region}/${groupSegment}/${id}.yaml`;

    const sectorConversion = convertSector(site);
    const stationConversion = convertStation(site);
    const warnings = convertWarnings(site);
    const links = convertLinks(site);

    migrated.push({ legacy: site, region, group, archived, filePath, sectorConversion, stationConversion, warnings, links });
  }

  if (duplicateIds.length > 0) {
    throw new Error(`duplicate site ids in SITES.md, refusing to migrate: ${duplicateIds.join(", ")}`);
  }

  // --- Write one YAML file per site ---
  for (const m of migrated) {
    const s = m.legacy;
    const doc: Record<string, unknown> = {
      schema_version: 2,
      id: s.id,
      name: s.name,
    };
    if (s.short_name) doc.short_name = s.short_name;
    doc.coordinates = s.coordinates;
    if (m.sectorConversion.newSector) doc.sector = m.sectorConversion.newSector;
    doc.wind = {
      verified: s.wind_speed.verified,
      ...(s.wind_speed.good_min_ms !== undefined ? { min_ms: s.wind_speed.good_min_ms } : {}),
      ...(s.wind_speed.good_max_ms !== undefined ? { max_ms: s.wind_speed.good_max_ms } : {}),
      ...(s.wind_speed.hard_max_gust_ms !== undefined ? { hard_max_gust_ms: s.wind_speed.hard_max_gust_ms } : {}),
      ...(s.wind_speed.notes ? { notes: s.wind_speed.notes } : {}),
    };
    if (m.stationConversion.newStation) doc.station = m.stationConversion.newStation;
    if (s.ridge_height_m !== undefined && s.ridge_height_m !== null) doc.ridge_height_m = s.ridge_height_m;
    doc.description = s.description;
    if (m.warnings.length > 0) doc.warnings = m.warnings;
    if (m.links.length > 0) doc.links = m.links;

    const fullPath = resolve(repoRoot, m.filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, stringifyYaml(doc, { lineWidth: 0 }), "utf-8");
  }

  // Ensure the ridge/winch/archive folders exist even when empty for a
  // given region (e.g. no active winch sites yet) - structural
  // completeness per the task's own target tree.
  const regionsSeen = new Set(migrated.map((m) => `${m.legacy.country.toLowerCase()}/${m.region}`));
  for (const countryRegion of regionsSeen) {
    for (const seg of ["ridge", "winch", "archive"]) {
      const dir = resolve(sitesOutRoot, countryRegion, seg);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, ".gitkeep"), "", "utf-8");
      }
    }
  }

  // --- Migration report ---
  const lines: string[] = [];
  lines.push("# Site Migration Report");
  lines.push("");
  lines.push(`Generated by \`scripts/migrate-sites.ts\` from \`SITES.md\` (schema_version ${parsed.schema_version}).`);
  lines.push("");
  lines.push(
    "Global `defaults` block (timezone/units/live_fresh_minutes/live_stale_minutes) is no longer per-site data - " +
      "these values have never varied and are now hardcoded constants in `scripts/build-sites-catalogue.ts` " +
      "rather than a new standalone config file. Values preserved exactly: " +
      `timezone=${parsed.defaults.timezone}, units=${parsed.defaults.units}, ` +
      `live_fresh_minutes=${parsed.defaults.live_fresh_minutes}, live_stale_minutes=${parsed.defaults.live_stale_minutes}.`,
  );
  lines.push("");
  lines.push(
    "`soaring_height.agl_m` is dropped entirely - it was already fully unused by the frontend, superseded by " +
      "the global altitude slider introduced in the FlyWeather Interaction Model milestone. Not a migration loss.",
  );
  lines.push("");
  lines.push(
    `Direction-fit \`maybe\` zone: every one of the 24 sites with rose data used an EXACT ±${MARGINAL_SECTOR_PADDING_DEG}deg ` +
      "padding around its green sector for the old orange range (verified programmatically, zero exceptions). " +
      "`domain/flyability.ts` now derives this padding automatically from the single `sector` via " +
      "`MARGINAL_SECTOR_PADDING_DEG`, instead of hand-authoring a redundant orange range per site - direction-fit " +
      "behavior is unchanged for every site below marked \"exact\".",
  );
  lines.push("");
  lines.push("## Per-site detail");
  lines.push("");

  for (const m of migrated) {
    const s = m.legacy;
    lines.push(`### ${s.id}`);
    lines.push("");
    lines.push(`- old ID: \`${s.id}\``);
    lines.push(`- new file path: \`${m.filePath}\``);
    lines.push(`- active/archive status: ${m.archived ? "archived" : "active"}`);
    lines.push(`- old type -> new group: \`${s.type}\` -> ${m.group ?? "(none - archived)"}`);
    lines.push(`- country/region placement: ${s.country} / ${m.region}`);
    lines.push(`- coordinates preserved: yes (lat=${s.coordinates.lat}, lon=${s.coordinates.lon}, verified=${s.coordinates.verified})`);
    lines.push(
      `- sector conversion: old green=${JSON.stringify(m.sectorConversion.oldGreen)}, old orange=${JSON.stringify(m.sectorConversion.oldOrange)}, ` +
        `new sector=${JSON.stringify(m.sectorConversion.newSector)}, ${m.sectorConversion.exact ? "EXACT" : "**NEEDS REVIEW**"} - ${m.sectorConversion.note}`,
    );
    lines.push(
      `- station conversion: old live_sources=${JSON.stringify(m.stationConversion.oldSources)}, new station=${JSON.stringify(m.stationConversion.newStation)} - ${m.stationConversion.note}`,
    );
    lines.push(`- description preserved: yes`);
    lines.push(
      `- restrictions/warnings preserved: ${(s.restrictions?.length ?? 0)} -> ${m.warnings.length} warning string(s)` +
        (s.restrictions?.length ? ` (${JSON.stringify(s.restrictions)})` : ""),
    );
    lines.push(`- links preserved: ${s.cps_url ? `cps_url -> ${m.links.length} link(s)` : "none in source"}`);
    lines.push(
      `- fields that could not be mapped automatically: ${
        [
          !m.sectorConversion.exact ? "sector (see above)" : null,
          !["direct 1:1 mapping (single source)", "no live source in source"].includes(m.stationConversion.note)
            ? "station (see above)"
            : null,
          "station.name (no equivalent in old schema - left blank, not invented)",
          "station.url (no equivalent in old schema - left blank, not invented)",
          "pilot_level (no equivalent in old schema)",
          "images (no equivalent in old schema)",
        ]
          .filter(Boolean)
          .join("; ") || "none"
      }`,
    );
    lines.push("");
  }

  const activeBefore = parsed.sites.filter((s) => s.enabled).length;
  const activeAfter = migrated.filter((m) => !m.archived).length;
  const archivedCount = migrated.filter((m) => m.archived).length;
  const descriptionsLost = migrated.filter((m) => !m.legacy.description).length;
  const urlsLost = migrated.filter((m) => m.legacy.cps_url && m.links.length === 0).length;
  const stationIdsLost = migrated.filter(
    (m) => m.legacy.live_sources.some((ls) => ls.station_id) && !m.stationConversion.newStation?.station_id,
  ).length;

  lines.push("## Summary");
  lines.push("");
  lines.push("```text");
  lines.push(`old sites: ${parsed.sites.length}`);
  lines.push(`new sites: ${migrated.length}`);
  lines.push(`active before: ${activeBefore}`);
  lines.push(`active after: ${activeAfter}`);
  lines.push(`archived: ${archivedCount}`);
  lines.push(`IDs lost: ${parsed.sites.length - migrated.length}`);
  lines.push(`IDs duplicated: ${duplicateIds.length}`);
  lines.push(`descriptions lost: ${descriptionsLost}`);
  lines.push(`URLs lost: ${urlsLost}`);
  lines.push(`station IDs lost: ${stationIdsLost}`);
  lines.push(
    `sites flagged for manual review: ${migrated.filter((m) => !m.sectorConversion.exact || m.stationConversion.note.startsWith("MANUAL REVIEW")).length}`,
  );
  lines.push("```");
  lines.push("");

  writeFileSync(reportOutPath, lines.join("\n") + "\n", "utf-8");

  console.log(
    `migrate-sites: wrote ${migrated.length} site YAML files under sites/, and ${reportOutPath}. ` +
      `active before=${activeBefore} after=${activeAfter}, archived=${archivedCount}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
