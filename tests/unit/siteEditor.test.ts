import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  draftToSiteFields,
  emptyDraft,
  sitePathFor,
  siteToDraft,
  slugify,
  suggestedId,
  uniqueId,
  validateDraft,
  type SiteDraft,
} from "../../src/domain/siteEditor.ts";
import { mergeSiteYaml } from "../../src/domain/siteYaml.ts";
import { siteFileSchema, parseSitePath } from "../../src/domain/siteFile.ts";
import { buildCatalogue } from "../../scripts/build-sites-catalogue.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

describe("slugify", () => {
  it("reproduces the ids already in the catalogue", () => {
    expect(slugify("Hovs Hallar NV")).toBe("hovs-hallar-nv");
    expect(slugify("Mölle")).toBe("molle");
    expect(slugify("Höganäs")).toBe("hoganas");
    expect(slugify("Barsebäck")).toBe("barseback");
    expect(slugify("Kåseberga S")).toBe("kaseberga-s");
  });

  it("collapses punctuation and trims stray separators", () => {
    expect(slugify("  Ales Stenar (SV)  ")).toBe("ales-stenar-sv");
    expect(slugify("A -- B")).toBe("a-b");
  });

  it("is empty for a name with nothing usable in it", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("suggestedId", () => {
  it("prefixes Danish sites with dk- to match the existing four", () => {
    expect(suggestedId("Dokkedal", "dk")).toBe("dk-dokkedal");
    expect(suggestedId("Gilbjerg Hoved", "dk")).toBe("dk-gilbjerg-hoved");
  });

  it("leaves Swedish sites unprefixed", () => {
    expect(suggestedId("Hammar", "se")).toBe("hammar");
  });

  it("does not double-prefix a name that already starts with dk", () => {
    expect(suggestedId("dk-lokken", "dk")).toBe("dk-lokken");
  });
});

describe("uniqueId", () => {
  it("returns the id untouched when it is free", () => {
    expect(uniqueId("hammar", ["molle", "ravlunda"])).toBe("hammar");
  });

  it("suffixes until free, skipping taken suffixes", () => {
    expect(uniqueId("hammar", ["hammar"])).toBe("hammar-2");
    expect(uniqueId("hammar", ["hammar", "hammar-2", "hammar-3"])).toBe("hammar-4");
  });
});

describe("sitePathFor", () => {
  it("produces a path parseSitePath can read the metadata back out of", () => {
    const path = sitePathFor({ country: "se", region: "skane", group: "ridge", id: "hammar" });
    expect(path).toBe("se/skane/ridge/hammar.yaml");
    const meta = parseSitePath(path);
    expect(meta).toEqual({ country: "se", region: "skane", group: "ridge", archived: false });
  });

  it("round-trips a winch site's group", () => {
    const path = sitePathFor({ country: "se", region: "skane", group: "winch", id: "klamby" });
    expect(parseSitePath(path).group).toBe("winch");
  });
});

describe("siteToDraft / draftToSiteFields round-trip", () => {
  const catalogue = buildCatalogue();

  it("keeps every real site valid against the production schema after a round-trip", () => {
    for (const site of catalogue.sites) {
      const fields = draftToSiteFields(siteToDraft(site));
      const result = siteFileSchema.safeParse(fields);
      expect(result.success, `${site.id}: ${JSON.stringify(result.success ? "" : result.error.issues)}`).toBe(true);
    }
  });

  it("carries Klamby's two sector ranges and its authored speed margin through untouched", () => {
    const klamby = catalogue.sites.find((s) => s.id === "klamby")!;
    const draft = siteToDraft(klamby);
    expect(draft.bands).toHaveLength(2);
    expect(draft.group).toBe("winch");
    expect(draft.wind.margin_over_ms).toBe(1);

    const fields = draftToSiteFields(draft) as { sector: { ranges: unknown[] } };
    expect(fields.sector.ranges).toHaveLength(2);
  });

  it("drops the sector entirely when the last band is removed", () => {
    const hammar = catalogue.sites.find((s) => s.id === "hammar")!;
    const draft: SiteDraft = { ...siteToDraft(hammar), bands: [] };
    expect(draftToSiteFields(draft)).not.toHaveProperty("sector");
  });
});

describe("editor signature (last_edited_by)", () => {
  const signed = (name: string): SiteDraft => ({
    ...emptyDraft(55.4, 14.0),
    id: "test-site",
    name: "Test Site",
    description: "A place.",
    lastEditedBy: name,
  });

  it("blocks saving without a full name", () => {
    for (const bad of ["", "   ", "Edvin", "E B", "admin"]) {
      const messages = validateDraft(signed(bad), []).map((p) => p.message);
      expect(messages, `"${bad}" should have been rejected`).toContain(
        "Enter your first name and surname before saving.",
      );
    }
  });

  it("accepts real names, including more than two parts", () => {
    for (const good of ["Edvin Buregren", "Anna-Lena Nilsson", "Jean Claude Van Damme"]) {
      expect(validateDraft(signed(good), []), `"${good}" should have been accepted`).toEqual([]);
    }
  });

  it("normalises whitespace into the saved field", () => {
    const fields = draftToSiteFields(signed("  Edvin   Buregren  "));
    expect(fields.last_edited_by).toBe("Edvin Buregren");
  });

  it("never emits a timestamp from the browser - the writer stamps it", () => {
    expect(draftToSiteFields(signed("Edvin Buregren"))).not.toHaveProperty("last_edited_at");
  });

  it("never carries the previous editor's name into a new edit", () => {
    const catalogue = buildCatalogue();
    const site = catalogue.sites.find((s) => s.id === "hammar")!;
    expect(siteToDraft(site).lastEditedBy).toBe("");
  });

  it("accepts a schema-valid stamp and rejects a one-word one", () => {
    const base = draftToSiteFields(signed("Edvin Buregren"));
    expect(siteFileSchema.safeParse({ ...base, last_edited_at: new Date().toISOString() }).success).toBe(true);
    expect(siteFileSchema.safeParse({ ...base, last_edited_by: "Edvin" }).success).toBe(false);
  });
});

describe("validateDraft", () => {
  const base = (): SiteDraft => ({
    ...emptyDraft(55.4, 14.0),
    id: "test-site",
    name: "Test Site",
    description: "A place.",
    lastEditedBy: "Edvin Buregren",
  });

  it("passes a complete minimal draft", () => {
    expect(validateDraft(base(), [])).toEqual([]);
  });

  it("rejects an id already used by another site", () => {
    const problems = validateDraft(base(), ["test-site"]);
    expect(problems.map((p) => p.field)).toContain("id");
  });

  it("rejects a verified wind band missing its numbers - the schema's own rule", () => {
    const draft = { ...base(), wind: { verified: true } };
    expect(validateDraft(draft, []).map((p) => p.field)).toContain("wind");
  });

  it("rejects min greater than max", () => {
    const draft = { ...base(), wind: { verified: true, min_ms: 9, max_ms: 4 } };
    expect(validateDraft(draft, []).map((p) => p.message)).toContain("Wind min cannot be greater than max.");
  });

  it("rejects a zero-width sector", () => {
    const draft = {
      ...base(),
      bands: [{ id: "b1", from_deg: 90, to_deg: 90, margin_under_deg: 0, margin_over_deg: 0 }],
    };
    expect(validateDraft(draft, []).map((p) => p.field)).toContain("bands");
  });

  it("rejects a station with no provider, which the build would refuse", () => {
    const draft = { ...base(), station: { provider: "", verified: false } };
    expect(validateDraft(draft, []).map((p) => p.field)).toContain("station");
  });

  it("accepts an untouched empty link row - clicking + Add link then changing your mind", () => {
    const draft = { ...base(), links: [{ label: "", url: "" }] };
    expect(validateDraft(draft, [])).toEqual([]);
    expect(draftToSiteFields(draft)).not.toHaveProperty("links");
  });

  it("blocks a half-filled link rather than silently discarding the typing", () => {
    const labelOnly = { ...base(), links: [{ label: "CPS listing", url: "" }] };
    expect(validateDraft(labelOnly, [])[0].message).toContain("needs a URL");

    const urlOnly = { ...base(), links: [{ label: "", url: "https://cps.to/x" }] };
    expect(validateDraft(urlOnly, [])[0].message).toContain("needs a label");
  });

  it("drops a blank warning row but keeps real ones, trimmed", () => {
    const draft = { ...base(), warnings: ["  ", "Livestock in the field.  ", ""] };
    expect(validateDraft(draft, [])).toEqual([]);
    expect(draftToSiteFields(draft).warnings).toEqual(["Livestock in the field."]);
  });

  it("produces a file the schema accepts when rows were added and abandoned", () => {
    const draft = { ...base(), links: [{ label: "", url: "" }], warnings: [""] };
    expect(siteFileSchema.safeParse(draftToSiteFields(draft)).success).toBe(true);
  });

  it("requires a name and a description", () => {
    const problems = validateDraft({ ...base(), name: "  ", description: "" }, []);
    expect(problems.map((p) => p.field).sort()).toEqual(["description", "name"]);
  });
});

describe("mergeSiteYaml preserves everything the editor does not model", () => {
  const klambyPath = resolve(repoRoot, "sites/se/skane/winch/klamby.yaml");
  const original = readFileSync(klambyPath, "utf-8");

  it("keeps coordinates.source through an edit that changes lat/lon", () => {
    const catalogue = buildCatalogue();
    const draft = siteToDraft(catalogue.sites.find((s) => s.id === "klamby")!);
    const edited: SiteDraft = { ...draft, coordinates: { lat: 55.7, lon: 13.8, verified: true } };

    const merged = mergeSiteYaml(original, draftToSiteFields(edited));
    const parsed = parseYaml(merged);

    expect(parsed.coordinates.lat).toBe(55.7);
    expect(parsed.coordinates.source).toContain("User-supplied field coordinates");
  });

  it("keeps station.note, which the editor has no field for", () => {
    const catalogue = buildCatalogue();
    const draft = siteToDraft(catalogue.sites.find((s) => s.id === "klamby")!);
    const merged = mergeSiteYaml(original, draftToSiteFields({ ...draft, name: "Klamby Field" }));
    const parsed = parseYaml(merged);

    expect(parsed.name).toBe("Klamby Field");
    expect(parsed.station.note).toContain("Sjöbo Flyg");
  });

  it("keeps wind.notes on a site that has them", () => {
    const barsebackPath = resolve(repoRoot, "sites/se/skane/ridge/barseback.yaml");
    const barsebackText = readFileSync(barsebackPath, "utf-8");
    const catalogue = buildCatalogue();
    const draft = siteToDraft(catalogue.sites.find((s) => s.id === "barseback")!);

    const merged = mergeSiteYaml(barsebackText, draftToSiteFields(draft));
    expect(parseYaml(merged).wind.notes).toContain("no point coming here");
  });

  it("removes a key the user emptied rather than leaving the old value behind", () => {
    const catalogue = buildCatalogue();
    const draft = siteToDraft(catalogue.sites.find((s) => s.id === "klamby")!);
    const merged = mergeSiteYaml(original, draftToSiteFields({ ...draft, bands: [], warnings: [] }));
    const parsed = parseYaml(merged);

    expect(parsed.sector).toBeUndefined();
    expect(parsed.warnings).toBeUndefined();
  });

  it("produces a file the production schema accepts, for every real site, unchanged", () => {
    const catalogue = buildCatalogue();
    for (const site of catalogue.sites) {
      const relPath = `${site.country}/${site.region}/${site.group ?? "archive"}/${site.id}.yaml`;
      const diskPath = resolve(repoRoot, "sites", site.group === null ? `${site.country}/${site.region}/archive/${site.id}.yaml` : relPath);
      const text = readFileSync(diskPath, "utf-8");
      const merged = mergeSiteYaml(text, draftToSiteFields(siteToDraft(site)));
      const result = siteFileSchema.safeParse(parseYaml(merged));
      expect(result.success, `${site.id} failed: ${result.success ? "" : JSON.stringify(result.error.issues)}`).toBe(
        true,
      );
    }
  });

  it("creates a brand new file in the same key order as a hand-authored one", () => {
    const draft: SiteDraft = {
      ...emptyDraft(55.5, 13.5),
      id: "new-ridge",
      name: "New Ridge",
      description: "A new site.",
      lastEditedBy: "Edvin Buregren",
    };
    const yamlText = mergeSiteYaml(null, draftToSiteFields(draft));
    const keys = yamlText
      .split("\n")
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(":")[0]);

    expect(keys).toEqual(["schema_version", "id", "name", "coordinates", "wind", "description", "last_edited_by"]);
    expect(siteFileSchema.safeParse(parseYaml(yamlText)).success).toBe(true);
  });
});
