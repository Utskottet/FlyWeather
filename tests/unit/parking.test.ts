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
