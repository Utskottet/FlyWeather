import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { siteFileSchema, parseSitePath, type SiteFile } from "../../src/domain/siteFile.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const sitesRoot = resolve(repoRoot, "sites");

function baseSite(overrides: Partial<SiteFile> = {}): SiteFile {
  return {
    schema_version: 2,
    id: "test-site",
    name: "Test Site",
    coordinates: { lat: 55.4, lon: 14.0, verified: true },
    sector: { from_deg: 200, to_deg: 250, verified: false },
    wind: { verified: false },
    description: "A test site.",
    ...overrides,
  } as SiteFile;
}

describe("siteFileSchema", () => {
  it("accepts a well-formed minimal site", () => {
    expect(siteFileSchema.safeParse(baseSite()).success).toBe(true);
  });

  it("rejects an invalid latitude", () => {
    const result = siteFileSchema.safeParse(baseSite({ coordinates: { lat: 999, lon: 14.0, verified: true } }));
    expect(result.success).toBe(false);
  });

  it("rejects coordinates marked verified with a null lat/lon", () => {
    const result = siteFileSchema.safeParse(baseSite({ coordinates: { lat: null, lon: null, verified: true } }));
    expect(result.success).toBe(false);
  });

  it("allows unverified null coordinates", () => {
    const result = siteFileSchema.safeParse(baseSite({ coordinates: { lat: null, lon: null, verified: false } }));
    expect(result.success).toBe(true);
  });

  it("rejects a degree value outside 0-360", () => {
    const result = siteFileSchema.safeParse(baseSite({ sector: { from_deg: -10, to_deg: 50, verified: false } }));
    expect(result.success).toBe(false);
  });

  it("rejects a zero-width (malformed) sector", () => {
    const result = siteFileSchema.safeParse(baseSite({ sector: { from_deg: 100, to_deg: 100, verified: false } }));
    expect(result.success).toBe(false);
  });

  it("accepts a north-crossing sector like 330 -> 30", () => {
    const result = siteFileSchema.safeParse(baseSite({ sector: { from_deg: 330, to_deg: 30, verified: true } }));
    expect(result.success).toBe(true);
  });

  it("allows a site with no sector at all (null or omitted)", () => {
    expect(siteFileSchema.safeParse(baseSite({ sector: null })).success).toBe(true);
    const withoutSector: Partial<SiteFile> = baseSite();
    delete withoutSector.sector;
    expect(siteFileSchema.safeParse(withoutSector).success).toBe(true);
  });

  it("rejects verified wind missing required min_ms/max_ms", () => {
    const result = siteFileSchema.safeParse(baseSite({ wind: { verified: true } }));
    expect(result.success).toBe(false);
  });

  it("allows unverified wind with no numbers", () => {
    expect(siteFileSchema.safeParse(baseSite({ wind: { verified: false } })).success).toBe(true);
  });

  it("accepts verified wind with min_ms/max_ms present", () => {
    const result = siteFileSchema.safeParse(baseSite({ wind: { verified: true, min_ms: 4, max_ms: 7 } }));
    expect(result.success).toBe(true);
  });

  it("rejects schema_version other than 2", () => {
    expect(siteFileSchema.safeParse(baseSite({ schema_version: 1 as 2 })).success).toBe(false);
  });
});

describe("parseSitePath (§ FlyWeather Site Catalogue Migration - country/region/group/archived derived from path)", () => {
  it("derives country/region/group for an active ridge site", () => {
    expect(parseSitePath("se/skane/ridge/hammar.yaml")).toEqual({
      country: "se",
      region: "skane",
      group: "ridge",
      archived: false,
    });
  });

  it("derives group=winch for an active winch site", () => {
    expect(parseSitePath("dk/nordjylland/winch/example.yaml")).toEqual({
      country: "dk",
      region: "nordjylland",
      group: "winch",
      archived: false,
    });
  });

  it("marks an archive/ site archived, with no recoverable group", () => {
    expect(parseSitePath("se/skane/archive/vitemolla.yaml")).toEqual({
      country: "se",
      region: "skane",
      group: null,
      archived: true,
    });
  });

  it("throws on a path with an unrecognized group segment", () => {
    expect(() => parseSitePath("se/skane/mystery/site.yaml")).toThrow(/unrecognized group segment/);
  });

  it("throws on a path that's too shallow", () => {
    expect(() => parseSitePath("skane/ridge/site.yaml")).toThrow(/too shallow/);
  });
});

describe("real sites/ catalogue (committed data)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extname(entry.name) === ".yaml") files.push(full);
    }
  };
  walk(sitesRoot);

  it("found at least one site file to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(sitesRoot.length + 1), f] as const))(
    "%s validates against siteFileSchema and its own path",
    (rel, full) => {
      const raw = parseYaml(readFileSync(full, "utf-8"));
      const result = siteFileSchema.safeParse(raw);
      if (!result.success) console.error(rel, result.error.issues);
      expect(result.success).toBe(true);
      expect(() => parseSitePath(rel.split("\\").join("/"))).not.toThrow();
    },
  );
});
