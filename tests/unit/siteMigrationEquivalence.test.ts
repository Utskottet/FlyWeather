import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { legacySitesDataSchema, extractYamlBlock, type LegacySite } from "../../src/domain/legacySites.ts";
import { buildCatalogue } from "../../scripts/build-sites-catalogue.ts";
import { isAngleInSector } from "../../src/domain/direction.ts";
import type { Site } from "../../src/domain/sites.ts";

/**
 * Semantic comparison (§ FlyWeather Site Catalogue Migration): generates
 * the old sites.json from SITES.md and the new one from sites/**\/*.yaml,
 * normalizes intentional schema differences, and asserts equivalence for
 * everything the app actually displays/computes with. Must fail loudly on
 * any unexpected difference rather than silently passing.
 *
 * Intentional, normalized-away differences (documented in
 * SITE_MIGRATION_REPORT.md, not bugs):
 * - rose.green[]/orange[] -> single `sector` (+ a uniform derived padding
 *   policy replacing hand-authored orange) - compared via a direction-fit
 *   BEHAVIOR sweep below, not raw field equality.
 * - wind_speed's 4-number good/maybe band -> wind's single min_ms/max_ms
 *   band - every site has wind.verified=false today, so there's no real
 *   data to compare band-for-band; only `verified`/`notes` are compared.
 * - live_sources[] -> single `station` - every site has at most 1 source,
 *   so this is a lossless 1:1 array<->object mapping, compared field-for-field.
 * - restrictions[].message -> warnings[] strings (severity folded into a
 *   "[HARD] " prefix) - compared by substring, not exact object shape.
 * - cps_url -> links[] - compared by URL presence, not field name.
 * - type (hang/winch/paramotor/school/other) -> group (ridge/winch/null),
 *   country/region -> folder-derived instead of a per-site field.
 * - soaring_height.agl_m is dropped entirely - already fully unused by the
 *   frontend (superseded by the global altitude slider), not compared.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// Loaded synchronously at module scope, not in beforeAll - it.each below
// needs the array immediately at collection time, before any hook runs.
const legacyMarkdown = readFileSync(resolve(repoRoot, "SITES.md"), "utf-8");
const oldSites: LegacySite[] = legacySitesDataSchema.parse(parseYaml(extractYamlBlock(legacyMarkdown))).sites;
const newSitesById: Map<string, Site> = new Map(buildCatalogue().sites.map((s) => [s.id, s]));

/** Reproduces the pre-migration two-array direction-fit algorithm, purely for this comparison. */
function legacyDirectionFit(angle: number, green: LegacySite["rose"]["green"], orange: LegacySite["rose"]["orange"]) {
  if (green.length === 0 && orange.length === 0) return "unknown";
  if (green.some((s) => isAngleInSector(angle, s.from_deg, s.to_deg))) return "good";
  if (orange.some((s) => isAngleInSector(angle, s.from_deg, s.to_deg))) return "maybe";
  return "bad";
}

function newDirectionFit(angle: number, sector: Site["sector"]) {
  if (!sector) return "unknown";
  if (isAngleInSector(angle, sector.from_deg, sector.to_deg)) return "good";
  const PAD = 11.25;
  const paddedFrom = ((sector.from_deg - PAD) % 360 + 360) % 360;
  const paddedTo = ((sector.to_deg + PAD) % 360 + 360) % 360;
  if (isAngleInSector(angle, paddedFrom, paddedTo)) return "maybe";
  return "bad";
}

describe("site migration equivalence: old SITES.md-generated catalogue vs new sites/**/*.yaml-generated catalogue", () => {
  it("has no lost or duplicated IDs - every old site has exactly one new counterpart", () => {
    for (const old of oldSites) {
      expect(newSitesById.has(old.id), `old site "${old.id}" missing from new catalogue`).toBe(true);
    }
    expect(newSitesById.size).toBe(oldSites.length);
  });

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: preserves active state, identity, coordinates, description", (id, old) => {
    const now = newSitesById.get(id)!;
    expect(now.enabled).toBe(old.enabled);
    expect(now.name).toBe(old.name);
    expect(now.short_name).toBe(old.short_name);
    expect(now.coordinates.lat).toBe(old.coordinates.lat);
    expect(now.coordinates.lon).toBe(old.coordinates.lon);
    expect(now.coordinates.verified).toBe(old.coordinates.verified);
    expect(now.description).toBe(old.description);
    expect(now.ridge_height_m ?? null).toBe(old.ridge_height_m ?? null);
  });

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: old type maps to the expected new group (or archived)", (id, old) => {
    const now = newSitesById.get(id)!;
    // Archived sites never have a recoverable group from the path alone
    // (by design - see domain/siteFile.ts's parseSitePath), regardless of
    // what their old `type` was.
    if (!old.enabled) {
      expect(now.group).toBeNull();
    } else if (old.type === "hang") {
      expect(now.group).toBe("ridge");
    } else if (old.type === "winch") {
      expect(now.group).toBe("winch");
    } else {
      expect(now.group).toBeNull(); // paramotor/school/other have no ridge/winch equivalent
    }
  });

  it.each(oldSites.map((s) => [s.id, s] as const))(
    "%s: direction-fit BEHAVIOR is preserved across a full 360deg sweep (not just the raw numbers)",
    (id, old) => {
      const now = newSitesById.get(id)!;
      for (let angle = 0; angle < 360; angle += 5) {
        const before = legacyDirectionFit(angle, old.rose.green, old.rose.orange);
        const after = newDirectionFit(angle, now.sector);
        expect(after, `${id} at ${angle}deg: was "${before}", now "${after}"`).toBe(before);
      }
    },
  );

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: wind verification state is preserved (no real thresholds existed to lose)", (id, old) => {
    const now = newSitesById.get(id)!;
    expect(now.wind.verified).toBe(old.wind_speed.verified);
    expect(now.wind.notes ?? undefined).toBe(old.wind_speed.notes ?? undefined);
  });

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: live station lookup is preserved 1:1", (id, old) => {
    const now = newSitesById.get(id)!;
    if (old.live_sources.length === 0) {
      expect(now.station ?? null).toBeNull();
    } else {
      expect(old.live_sources).toHaveLength(1); // documented precondition - see file header
      const src = old.live_sources[0];
      expect(now.station).not.toBeNull();
      expect(now.station!.provider).toBe(src.provider);
      expect(now.station!.station_id ?? null).toBe(src.station_id ?? null);
      expect(now.station!.verified).toBe(src.verified);
    }
  });

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: every restriction message survives into warnings", (id, old) => {
    const now = newSitesById.get(id)!;
    const warnings = now.warnings ?? [];
    for (const restriction of old.restrictions ?? []) {
      expect(warnings.some((w) => w.includes(restriction.message)), `lost restriction on ${id}: ${restriction.message}`).toBe(
        true,
      );
    }
  });

  it.each(oldSites.map((s) => [s.id, s] as const))("%s: cps_url survives into links", (id, old) => {
    const now = newSitesById.get(id)!;
    if (old.cps_url) {
      expect((now.links ?? []).some((l) => l.url === old.cps_url), `lost cps_url on ${id}: ${old.cps_url}`).toBe(true);
    }
  });

  it("active site count is unchanged", () => {
    const oldActive = oldSites.filter((s) => s.enabled).length;
    const newActive = [...newSitesById.values()].filter((s) => s.enabled).length;
    expect(newActive).toBe(oldActive);
  });
});
