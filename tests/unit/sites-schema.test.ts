import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { sitesDataSchema, type Site } from "../../src/domain/sites.ts";
import { extractYamlBlock } from "../../scripts/parse-sites.ts";

function baseSite(overrides: Partial<Site> = {}): Site {
  return {
    id: "test-site",
    enabled: true,
    name: "Test Site",
    country: "SE",
    type: "hang",
    coordinates: { lat: 55.4, lon: 14.0, verified: true },
    rose: {
      verified: false,
      green: [{ from_deg: 200, to_deg: 250 }],
      orange: [],
    },
    wind_speed: { verified: false },
    soaring_height: { agl_m: 100, verified: false },
    live_sources: [],
    description: "A test site.",
    ...overrides,
  } as Site;
}

function baseData(sites: Site[]) {
  return {
    schema_version: 1,
    defaults: {
      timezone: "Europe/Stockholm",
      units: "m/s",
      live_fresh_minutes: 10,
      live_stale_minutes: 30,
    },
    sites,
  };
}

describe("sitesDataSchema", () => {
  it("accepts a well-formed minimal site", () => {
    const result = sitesDataSchema.safeParse(baseData([baseSite()]));
    expect(result.success).toBe(true);
  });

  it("rejects duplicate site ids", () => {
    const result = sitesDataSchema.safeParse(
      baseData([baseSite({ id: "dup" }), baseSite({ id: "dup" })]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("duplicate site id"))).toBe(true);
    }
  });

  it("rejects an invalid latitude", () => {
    const result = sitesDataSchema.safeParse(
      baseData([
        baseSite({
          coordinates: { lat: 999, lon: 14.0, verified: true },
        }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects coordinates marked verified with a null lat/lon", () => {
    const result = sitesDataSchema.safeParse(
      baseData([baseSite({ coordinates: { lat: null, lon: null, verified: true } })]),
    );
    expect(result.success).toBe(false);
  });

  it("allows unverified null coordinates", () => {
    const result = sitesDataSchema.safeParse(
      baseData([baseSite({ coordinates: { lat: null, lon: null, verified: false } })]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a degree value outside 0-360", () => {
    const result = sitesDataSchema.safeParse(
      baseData([
        baseSite({
          rose: {
            verified: false,
            green: [{ from_deg: -10, to_deg: 50 }],
            orange: [],
          },
        }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a zero-width (malformed) sector", () => {
    const result = sitesDataSchema.safeParse(
      baseData([
        baseSite({
          rose: {
            verified: false,
            green: [{ from_deg: 100, to_deg: 100 }],
            orange: [],
          },
        }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a wrap-around sector like 337.5 -> 22.5", () => {
    const result = sitesDataSchema.safeParse(
      baseData([
        baseSite({
          rose: {
            verified: false,
            green: [{ from_deg: 337.5, to_deg: 22.5 }],
            orange: [],
          },
        }),
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects verified wind_speed missing required bands", () => {
    const result = sitesDataSchema.safeParse(
      baseData([baseSite({ wind_speed: { verified: true } })]),
    );
    expect(result.success).toBe(false);
  });

  it("allows unverified wind_speed with no bands", () => {
    const result = sitesDataSchema.safeParse(
      baseData([baseSite({ wind_speed: { verified: false } })]),
    );
    expect(result.success).toBe(true);
  });

  it("accepts verified wind_speed with all required bands present", () => {
    const result = sitesDataSchema.safeParse(
      baseData([
        baseSite({
          wind_speed: {
            verified: true,
            good_min_ms: 4,
            good_max_ms: 7,
            maybe_min_ms: 3,
            maybe_max_ms: 8,
          },
        }),
      ]),
    );
    expect(result.success).toBe(true);
  });
});

describe("extractYamlBlock", () => {
  it("extracts a fenced yaml block", () => {
    const md = "intro text\n\n```yaml\nfoo: 1\nbar: 2\n```\n\ntrailing text";
    expect(extractYamlBlock(md).trim()).toBe("foo: 1\nbar: 2");
  });

  it("throws when no yaml block is present", () => {
    expect(() => extractYamlBlock("no code block here")).toThrow();
  });
});

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("SITES.md (real file)", () => {
  it("parses and validates against the schema", () => {
    const md = readFileSync(resolve(__dirname, "../../SITES.md"), "utf-8");
    const yamlText = extractYamlBlock(md);
    const raw = parseYaml(yamlText);
    const result = sitesDataSchema.safeParse(raw);
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });
});
