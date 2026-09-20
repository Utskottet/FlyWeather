import { isFullName } from "./contributor.ts";
import type { Site } from "./sites.ts";
import type { SiteFile } from "./siteFile.ts";

/**
 * The bridge between the in-app site editor's working shape and the real
 * catalogue (domain/siteFile.ts + the sites/ folder layout).
 *
 * The editor once had a schema of its own (the admin-experiment
 * prototype's `siteDraft.ts`, since deleted) because it was separately
 * hosted. Keeping two
 * definitions of what a site is meant they drifted apart in eleven places,
 * so there is now exactly one - `siteFileSchema` - and this module only
 * translates between it and what a form needs to hold:
 *
 *  - `bands[]` carry a UI-local `id` so React can key them and the drag
 *    handles can target one edge. Site files have no such id and must not
 *    grow one, so it is assigned on load and stripped on save.
 *  - `country`/`region`/`group` are form fields here but are NOT authored
 *    in a site file - they are derived from its path by parseSitePath().
 *    So the editor's job is to *produce the path*, which sitePathFor does.
 */

export interface EditorBand {
  /** UI-local only - never written to a site file. */
  id: string;
  from_deg: number;
  to_deg: number;
  margin_under_deg: number;
  margin_over_deg: number;
}

export interface SiteDraft {
  /** Empty for a site that has not been named yet; derived from `name` on save. */
  id: string;
  name: string;
  short_name?: string;
  country: string;
  region: string;
  group: "ridge" | "winch";
  coordinates: { lat: number | null; lon: number | null; verified: boolean };
  bands: EditorBand[];
  sectorVerified: boolean;
  wind: SiteFile["wind"];
  station?: NonNullable<SiteFile["station"]>;
  parking?: NonNullable<SiteFile["parking"]>;
  pilot_level?: string;
  ridge_height_m: number | null;
  description: string;
  /**
   * Who is making THIS edit - never carried over from the file being
   * edited. Prefilled from the last name typed on this machine (see
   * app/editorIdentity.ts) so it is typed once, not once per save, but it
   * always describes the person saving now.
   */
  lastEditedBy: string;
  warnings: string[];
  links: { label: string; url: string }[];
}

/**
 * Re-exported rather than defined here: the same rule now guards the
 * contributor form, the publishing Worker and this module, and a rule
 * written down three times eventually becomes three rules.
 */
export { isFullName };

/**
 * Swedish/Danish letters are folded to their ASCII base rather than
 * dropped, matching every id already in the catalogue: Molle -> molle,
 * Hoganas -> hoganas, Barseback -> barseback, Larod -> larod.
 */
const TRANSLITERATIONS: Record<string, string> = {
  "å": "a",
  "ä": "a",
  "ö": "o",
  "æ": "ae",
  "ø": "o",
  "é": "e",
  "è": "e",
  "ü": "u",
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLITERATIONS[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Danish sites carry a `dk-` prefix and Swedish ones carry nothing - an
 * existing convention across all four Danish files (dk-dokkedal,
 * dk-lokken, dk-gilbjerg-hoved, dk-strandbjerggard) and none of the
 * Swedish ones. Reproduced rather than tidied, because ids appear in URLs
 * and renaming a live site's id breaks any link to it.
 */
export function suggestedId(name: string, country: string): string {
  const base = slugify(name);
  if (!base) return "";
  return country === "dk" && !base.startsWith("dk-") ? `dk-${base}` : base;
}

/**
 * Appends -2, -3 ... until the id is free. `taken` should be every id in
 * the catalogue including archived ones, since build-sites-catalogue.ts
 * rejects a duplicate id anywhere under sites/, archive included.
 */
export function uniqueId(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(desired)) return desired;
  for (let n = 2; ; n++) {
    const candidate = `${desired}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Where a draft's file belongs, relative to sites/ - the path IS the country/region/group metadata. */
export function sitePathFor(draft: Pick<SiteDraft, "country" | "region" | "group" | "id">): string {
  return `${draft.country}/${draft.region}/${draft.group}/${draft.id}.yaml`;
}

let bandIdCounter = 0;
function nextBandId(): string {
  bandIdCounter += 1;
  return `band-${bandIdCounter}`;
}

export function newBand(existing: EditorBand[]): EditorBand {
  const from = existing.length > 0 ? existing[existing.length - 1].to_deg : 0;
  return {
    id: nextBandId(),
    from_deg: from % 360,
    to_deg: (from + 90) % 360,
    margin_under_deg: 0,
    margin_over_deg: 0,
  };
}

/** An empty draft, positioned at the map's current centre - the cheapest part of Add site. */
export function emptyDraft(lat: number, lon: number): SiteDraft {
  return {
    id: "",
    name: "",
    country: "se",
    region: "skane",
    group: "ridge",
    coordinates: { lat, lon, verified: false },
    lastEditedBy: "",
    bands: [],
    sectorVerified: false,
    wind: { verified: false },
    ridge_height_m: null,
    description: "",
    warnings: [],
    links: [],
  };
}

export function siteToDraft(site: Site): SiteDraft {
  return {
    id: site.id,
    name: site.name,
    short_name: site.short_name,
    country: site.country,
    region: site.region,
    // Archived files sit directly under archive/ so their original group
    // is not recoverable from the path - default to ridge rather than
    // guessing silently, and let the form show it for correction.
    group: site.group ?? "ridge",
    coordinates: {
      lat: site.coordinates.lat,
      lon: site.coordinates.lon,
      verified: site.coordinates.verified,
    },
    bands: (site.sector?.ranges ?? []).map((r) => ({
      id: nextBandId(),
      from_deg: r.from_deg,
      to_deg: r.to_deg,
      margin_under_deg: r.margin_under_deg ?? 0,
      margin_over_deg: r.margin_over_deg ?? 0,
    })),
    sectorVerified: site.sector?.verified ?? false,
    // Blank on purpose: the previous editor's name is not evidence of who
    // is editing now, and prefilling it would let one person's edit be
    // recorded under another's.
    lastEditedBy: "",
    wind: site.wind,
    station: site.station ?? undefined,
    parking: site.parking ?? undefined,
    pilot_level: site.pilot_level,
    ridge_height_m: site.ridge_height_m ?? null,
    description: site.description,
    warnings: site.warnings ?? [],
    links: site.links ?? [],
  };
}

/**
 * The fields the editor is responsible for, ready to be merged over an
 * existing file. Deliberately NOT a whole SiteFile: anything the editor
 * does not model (coordinates.source on 25 of 30 sites, wind.notes,
 * hard_max_gust_ms, images, and any field added later) must survive an
 * edit untouched, so the writer merges these keys in rather than
 * replacing the document.
 */
export function draftToSiteFields(draft: SiteDraft): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    schema_version: 2,
    id: draft.id,
    name: draft.name,
    coordinates: draft.coordinates,
    wind: draft.wind,
    description: draft.description,
    // last_edited_at is NOT set here - the writer stamps it at the moment
    // it actually writes, so the recorded time can never be the browser's
    // wrong clock or a form that sat open for an hour.
  };

  // Omitted rather than emitted empty when unsigned. validateDraft makes
  // it impossible to SAVE without a name, but a draft can be read back out
  // of an existing file that predates the field, and stamping "" there
  // would both fail the schema and assert a provenance nobody claimed.
  const signature = draft.lastEditedBy.trim().replace(/\s+/g, " ");
  if (signature) fields.last_edited_by = signature;

  if (draft.short_name) fields.short_name = draft.short_name;
  if (draft.bands.length > 0) {
    fields.sector = {
      ranges: draft.bands.map((b) => ({
        from_deg: b.from_deg,
        to_deg: b.to_deg,
        margin_under_deg: b.margin_under_deg,
        margin_over_deg: b.margin_over_deg,
      })),
      verified: draft.sectorVerified,
    };
  }
  if (draft.station) fields.station = draft.station;
  if (draft.parking) fields.parking = draft.parking;
  if (draft.pilot_level) fields.pilot_level = draft.pilot_level;
  if (draft.ridge_height_m !== null) fields.ridge_height_m = draft.ridge_height_m;
  // "+ Add warning" and "+ Add link" both append an empty row, and an
  // untouched one means the user changed their mind - not that the site
  // has a blank warning. Dropped rather than saved, because linkSchema
  // requires a non-empty label and url, so a blank row would fail the
  // build. Partially-filled rows are NOT dropped: validateDraft blocks
  // those instead, since silently discarding something half-typed would
  // lose real work.
  const warnings = draft.warnings.map((w) => w.trim()).filter((w) => w.length > 0);
  const links = draft.links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label.length > 0 || l.url.length > 0);

  if (warnings.length > 0) fields.warnings = warnings;
  if (links.length > 0) fields.links = links;

  return fields;
}

export interface DraftProblem {
  field: string;
  message: string;
}

/**
 * What must be true before a draft can become a file the build accepts.
 * Mirrors siteFileSchema's own refinements rather than inventing new
 * rules, so the editor can never produce a file that then fails the build.
 */
export function validateDraft(draft: SiteDraft, takenIds: Iterable<string>): DraftProblem[] {
  const problems: DraftProblem[] = [];

  if (!draft.name.trim()) problems.push({ field: "name", message: "Name is required." });
  if (!isFullName(draft.lastEditedBy)) {
    problems.push({ field: "lastEditedBy", message: "Enter your first name and surname before saving." });
  }
  if (!draft.description.trim()) problems.push({ field: "description", message: "Description is required." });
  if (!draft.id) problems.push({ field: "id", message: "Id is required (it is derived from the name)." });
  else if (new Set(takenIds).has(draft.id)) {
    problems.push({ field: "id", message: `Id "${draft.id}" is already used by another site.` });
  }

  if (draft.coordinates.verified && (draft.coordinates.lat === null || draft.coordinates.lon === null)) {
    problems.push({ field: "coordinates", message: "Verified coordinates need both a latitude and a longitude." });
  }
  if (draft.wind.verified && (draft.wind.min_ms === undefined || draft.wind.max_ms === undefined)) {
    problems.push({ field: "wind", message: "A verified wind band needs both min and max." });
  }
  if (draft.wind.min_ms !== undefined && draft.wind.max_ms !== undefined && draft.wind.min_ms > draft.wind.max_ms) {
    problems.push({ field: "wind", message: "Wind min cannot be greater than max." });
  }
  for (const band of draft.bands) {
    if (band.from_deg === band.to_deg) {
      problems.push({ field: "bands", message: "A sector cannot be zero-width (from and to are equal)." });
    }
  }
  if (draft.parking && !Number.isFinite(draft.parking.lat + draft.parking.lon)) {
    problems.push({ field: "parking", message: "Parking needs a coordinate (or remove the parking spot)." });
  }
  if (draft.station && !draft.station.provider?.trim()) {
    problems.push({ field: "station", message: "A station needs a provider name (or remove the station)." });
  }

  // A row with one half filled in is a half-finished edit, not an
  // abandoned one - draftToSiteFields keeps it, so it has to be caught
  // here or the build would reject the file (linkSchema requires both).
  draft.links.forEach((link, i) => {
    const label = link.label.trim();
    const url = link.url.trim();
    if (label && !url) problems.push({ field: "links", message: `Link ${i + 1} ("${label}") needs a URL.` });
    if (url && !label) problems.push({ field: "links", message: `Link ${i + 1} (${url}) needs a label.` });
  });

  return problems;
}
