import { describe, expect, it } from "vitest";
import { navigationUrl, parkingProblem, parseParkingLocation } from "../../src/domain/parking.ts";
import { mergeSiteYaml } from "../../src/domain/siteYaml.ts";
import { parse as parseYaml } from "yaml";

/**
 * Parking is authored by pasting whatever Google Maps gave you, and
 * stored as two numbers. These cover both halves: what a paste can be,
 * and that the result survives the next person's edit.
 */

describe("reading a pasted parking location", () => {
  it("takes what Google Maps' Copy coordinates puts on the clipboard", () => {
    expect(parseParkingLocation("55.411020, 13.995150")).toEqual({ ok: true, lat: 55.41102, lon: 13.99515 });
    expect(parseParkingLocation("55.411020,13.995150")).toMatchObject({ ok: true });
    expect(parseParkingLocation("  55.41102 13.99515  ")).toMatchObject({ ok: true });
  });

  it("takes a Swedish decimal comma without reading it as the separator", () => {
    expect(parseParkingLocation("55,41102; 13,99515")).toEqual({ ok: true, lat: 55.41102, lon: 13.99515 });
  });

  it("takes the URL forms a browser produces", () => {
    expect(parseParkingLocation("https://www.google.com/maps/@55.41102,13.99515,17z")).toMatchObject({
      ok: true,
      lat: 55.41102,
      lon: 13.99515,
    });
    expect(parseParkingLocation("https://www.google.com/maps?q=55.41102,13.99515")).toMatchObject({ ok: true });
    expect(
      parseParkingLocation("https://www.google.com/maps/dir/?api=1&destination=55.41102,13.99515"),
    ).toMatchObject({ ok: true });
  });

  it("does not mistake a URL's zoom level for a coordinate", () => {
    // "@55.41,13.99,17z" - a naive pair match finds 13.99,17 just as
    // readily as 55.41,13.99, and would drop the car park in the Baltic.
    const parsed = parseParkingLocation("https://www.google.com/maps/@55.41102,13.99515,17z");
    expect(parsed).toMatchObject({ lat: 55.41102, lon: 13.99515 });
  });

  it("refuses a short link rather than fetching it to find out", () => {
    // Resolving one means making a request to a contributor-supplied URL
    // from our servers - the thing the station allowlist exists to stop.
    const parsed = parseParkingLocation("https://maps.app.goo.gl/AbCdEf123");
    expect(parsed).toEqual({ ok: false, reason: "short-link" });
    expect(parkingProblem("short-link")).toMatch(/Kopiera koordinater/);
    expect(parkingProblem("short-link")).toMatch(/Copy coordinates/);
  });

  it("refuses coordinates that are not on Earth", () => {
    expect(parseParkingLocation("155.4, 13.9")).toEqual({ ok: false, reason: "out-of-range" });
    expect(parseParkingLocation("55.4, 999.9")).toEqual({ ok: false, reason: "out-of-range" });
  });

  it("treats an empty field as empty rather than as an error", () => {
    expect(parseParkingLocation("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parkingProblem("empty")).toBeNull();
  });

  it("refuses text that is not a location at all", () => {
    expect(parseParkingLocation("by the red barn")).toEqual({ ok: false, reason: "unrecognised" });
  });

  it("rounds to about a metre - more precision than that is a fiction about a gravel lot", () => {
    const parsed = parseParkingLocation("55.4110201234567, 13.9951501234567");
    expect(parsed).toEqual({ ok: true, lat: 55.41102, lon: 13.99515 });
  });
});

describe("the navigation link", () => {
  it("starts directions rather than showing a pin", () => {
    // The documented cross-platform form: opens the app on a phone,
    // which is the whole point in a car park at six in the morning.
    expect(navigationUrl({ lat: 55.41102, lon: 13.99515 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=55.41102,13.99515",
    );
  });
});

describe("parking survives an edit", () => {
  const existing = `schema_version: 2
id: hammar
name: Hammars backar
coordinates:
  lat: 55.41285
  lon: 13.993881
  verified: false
  source: CPS
wind:
  verified: true
  min_ms: 4
  max_ms: 8
parking:
  lat: 55.41102
  lon: 13.99515
  note: Grusplan, plats för 6 bilar
  gate_code_holder: styrelsen
description: A ridge.
`;

  const fields = {
    schema_version: 2,
    id: "hammar",
    name: "Hammars backar",
    coordinates: { lat: 55.41285, lon: 13.993881, verified: false },
    wind: { verified: true, min_ms: 4, max_ms: 8 },
    description: "A ridge.",
  };

  it("keeps a parking field the editor never sent", () => {
    // Same rule that protects coordinates.source and wind.notes: the
    // editor models a subset, and everything else survives byte for byte.
    const merged = parseYaml(mergeSiteYaml(existing, { ...fields, parking: { lat: 55.41102, lon: 13.99515 } }));
    expect(merged.parking.gate_code_holder).toBe("styrelsen");
  });

  it("lets the note be edited and cleared", () => {
    const changed = parseYaml(
      mergeSiteYaml(existing, { ...fields, parking: { lat: 55.41102, lon: 13.99515, note: "Ny text" } }),
    );
    expect(changed.parking.note).toBe("Ny text");

    const cleared = parseYaml(mergeSiteYaml(existing, { ...fields, parking: { lat: 55.41102, lon: 13.99515 } }));
    expect(cleared.parking.note).toBeUndefined();
  });

  it("removes parking entirely when the contributor removes it", () => {
    const merged = parseYaml(mergeSiteYaml(existing, fields));
    expect(merged.parking).toBeUndefined();
  });

  it("writes parking into a brand new site file", () => {
    const merged = parseYaml(
      mergeSiteYaml(null, { ...fields, parking: { lat: 55.41102, lon: 13.99515, note: "Vid grinden" } }),
    );
    expect(merged.parking).toEqual({ lat: 55.41102, lon: 13.99515, note: "Vid grinden" });
  });
});

describe("the generated catalogue carries every authored field", () => {
  it("copies every key of siteFileSchema into the published site", async () => {
    // Real bug, the day parking shipped: build-sites-catalogue.ts lists
    // the fields it copies one by one, and `parking` was not among them.
    // The YAML was written correctly and the field simply never reached
    // sites.json - so no button appeared, and reopening the editor showed
    // an empty parking box, because the editor loads from the catalogue
    // rather than from the file. Both symptoms, one missing line.
    //
    // Tested against a synthetic site that authors EVERY field rather
    // than against the real catalogue: a field no site happens to use yet
    // (images, today) would otherwise look identical to one the builder
    // is dropping. This asserts the mapping, so any field added to
    // siteFileSchema and forgotten in the builder fails here.
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { stringify } = await import("yaml");
    const { siteFileSchema } = await import("../../src/domain/siteFile.ts");
    const { buildCatalogue } = await import("../../scripts/build-sites-catalogue.ts");

    const complete = {
      schema_version: 2,
      id: "everything",
      name: "Everything",
      short_name: "Every",
      coordinates: { lat: 55.4, lon: 13.9, verified: true, source: "hand" },
      sector: { ranges: [{ from_deg: 180, to_deg: 260 }], verified: true },
      wind: { verified: true, min_ms: 4, max_ms: 8, hard_max_gust_ms: 12, notes: "prose" },
      station: { provider: "holfuy", station_id: "214", verified: false },
      parking: { lat: 55.41, lon: 13.99, note: "by the gate" },
      pilot_level: "easy",
      ridge_height_m: 37,
      description: "Authors every field the schema allows.",
      last_edited_by: "Anna Andersson",
      last_edited_at: "2026-09-20T18:00:00.000Z",
      warnings: ["a warning"],
      links: [{ label: "a link", url: "https://example.com" }],
      images: [{ url: "https://example.com/a.jpg", caption: "a caption" }],
    };
    // Sanity: the fixture really is a valid, complete site file.
    expect(siteFileSchema.safeParse(complete).success).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "startvind-catalogue-"));
    try {
      mkdirSync(join(root, "se", "skane", "ridge"), { recursive: true });
      writeFileSync(join(root, "se", "skane", "ridge", "everything.yaml"), stringify(complete), "utf-8");

      const built = buildCatalogue(root).sites.find((s) => s.id === "everything")!;
      const authored = Object.keys(siteFileSchema.shape).filter((key) => key !== "schema_version");

      for (const key of authored) {
        expect(
          (built as unknown as Record<string, unknown>)[key],
          `build-sites-catalogue.ts drops "${key}" - it is authored in the file but never reaches sites.json`,
        ).toBeDefined();
      }
      expect(built.parking).toEqual({ lat: 55.41, lon: 13.99, note: "by the gate" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
