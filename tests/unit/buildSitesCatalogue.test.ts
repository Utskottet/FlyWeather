import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildCatalogue } from "../../scripts/build-sites-catalogue.ts";

const tmpDirs: string[] = [];

function fixtureRoot(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "flyweather-sites-"));
  tmpDirs.push(dir);
  return dir;
}

function writeSite(root: string, relPath: string, yaml: string) {
  const full = resolve(root, relPath);
  mkdirSync(resolve(full, ".."), { recursive: true });
  writeFileSync(full, yaml, "utf-8");
}

const MINIMAL_SITE = `
schema_version: 2
id: alpha
name: Alpha Site
coordinates:
  lat: 55.0
  lon: 13.0
  verified: true
wind:
  verified: false
description: A minimal valid site.
`;

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildCatalogue (§ FlyWeather Site Catalogue Migration)", () => {
  it("derives country/region/group/enabled from an active site's path", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/ridge/alpha.yaml", MINIMAL_SITE);
    const catalogue = buildCatalogue(root);
    expect(catalogue.sites).toHaveLength(1);
    expect(catalogue.sites[0]).toMatchObject({ id: "alpha", country: "se", region: "skane", group: "ridge", enabled: true });
  });

  it("excludes an archived site from active output (enabled:false, group:null) without dropping it from the catalogue", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/archive/alpha.yaml", MINIMAL_SITE);
    const catalogue = buildCatalogue(root);
    expect(catalogue.sites).toHaveLength(1);
    expect(catalogue.sites[0]).toMatchObject({ enabled: false, group: null });
  });

  it("derives group=winch for a winch-folder site", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/winch/alpha.yaml", MINIMAL_SITE);
    const catalogue = buildCatalogue(root);
    expect(catalogue.sites[0].group).toBe("winch");
  });

  it("rejects duplicate IDs across different regions/groups, naming both files", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/ridge/alpha.yaml", MINIMAL_SITE);
    writeSite(root, "dk/nordjylland/ridge/alpha.yaml", MINIMAL_SITE.replace("id: alpha", "id: alpha"));
    expect(() => buildCatalogue(root)).toThrow(/duplicate site id "alpha"/);
  });

  it("identifies exactly which file is malformed, by name, without failing silently on the rest", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/ridge/alpha.yaml", MINIMAL_SITE);
    writeSite(root, "se/skane/ridge/broken.yaml", "id: [unclosed");
    let message = "";
    try {
      buildCatalogue(root);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("se/skane/ridge/broken.yaml");
  });

  it("identifies exactly which file failed schema validation, by name", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/ridge/alpha.yaml", MINIMAL_SITE);
    writeSite(root, "se/skane/ridge/nodescription.yaml", MINIMAL_SITE.replace(/description:.*/, "") + "\nid: nodesc\n");
    let message = "";
    try {
      buildCatalogue(root);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("se/skane/ridge/nodescription.yaml");
  });

  it("rejects a file sitting outside any recognized ridge/winch/archive group folder", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/mystery/alpha.yaml", MINIMAL_SITE);
    expect(() => buildCatalogue(root)).toThrow(/unrecognized group segment/);
  });

  it("produces zero sites for an empty tree rather than erroring", () => {
    const root = fixtureRoot();
    mkdirSync(root, { recursive: true });
    const catalogue = buildCatalogue(root);
    expect(catalogue.sites).toEqual([]);
  });

  it("always publishes the fixed, never-varied defaults block", () => {
    const root = fixtureRoot();
    writeSite(root, "se/skane/ridge/alpha.yaml", MINIMAL_SITE);
    const catalogue = buildCatalogue(root);
    expect(catalogue.defaults).toEqual({
      timezone: "Europe/Stockholm",
      units: "m/s",
      live_fresh_minutes: 10,
      live_stale_minutes: 30,
    });
  });
});
