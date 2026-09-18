import { parseDocument, type Document } from "yaml";

/**
 * Turns the editor's field set into YAML text, merging into an existing
 * file rather than replacing it.
 *
 * Lives under src/domain/ rather than scripts/ because it has three
 * callers in two runtimes: the local dev-server plugin (node), the
 * publishing Worker (Cloudflare), and the test suite. Its only import is
 * `yaml`, so it runs unchanged in all of them - deliberately no node:fs,
 * no path handling, nothing that assumes a filesystem.
 *
 * Merging (not overwriting) is the whole point. The editor models a
 * deliberate subset of a site file; everything else it has never heard of
 * has to survive an edit byte-for-byte. Today that is `coordinates.source`
 * (real provenance prose on 25 of 30 sites), `wind.notes` (3 sites),
 * `hard_max_gust_ms` and `images` - but the same rule protects any field
 * added to siteFileSchema later without anyone remembering to teach the
 * editor about it. Using yaml's Document API rather than parse+stringify
 * also keeps comments and the existing formatting of untouched nodes.
 */

/**
 * Top-level keys the editor genuinely owns: if it did not emit one, the
 * user removed it and it must be deleted from the file. Without this an
 * emptied warnings list or a deleted sector would silently persist,
 * because "absent from the patch" would otherwise mean "leave alone".
 */
const EDITOR_OWNED_OPTIONAL_KEYS = [
  "short_name",
  "sector",
  "station",
  "pilot_level",
  "ridge_height_m",
  "warnings",
  "links",
] as const;

/**
 * Keys merged subkey-by-subkey rather than replaced wholesale, so siblings
 * the editor does not model survive - `coordinates.source` (25 of 31
 * sites) and `wind.notes` / `wind.hard_max_gust_ms`.
 *
 * `ownedOptional` lists the subkeys the editor genuinely owns and may
 * legitimately clear: if one is absent from the patch the operator removed
 * it, so it is deleted rather than left behind. Without that, clearing a
 * wind margin would be impossible - the old value would merge straight
 * back in. Anything not listed is none of the editor's business and is
 * left exactly as it was.
 *
 * Replacing `wind` wholesale instead would work only as long as the client
 * echoes back every field it was given. The publishing Worker must not
 * depend on that: a client that sends a minimal, valid payload would
 * silently destroy a site's notes.
 */
const SUBMERGED_KEYS: Record<string, { ownedOptional: string[] }> = {
  coordinates: { ownedOptional: [] },
  wind: { ownedOptional: ["min_ms", "max_ms", "margin_under_ms", "margin_over_ms"] },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** yaml writes `undefined` as `null`, which is a different statement - drop those keys instead. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Key order for a newly created file, matching the hand-authored files so
 * a generated site is indistinguishable from one written by hand. Keys not
 * listed here keep insertion order after these.
 */
const NEW_FILE_KEY_ORDER = [
  "schema_version",
  "id",
  "name",
  "short_name",
  "coordinates",
  "sector",
  "wind",
  "station",
  "pilot_level",
  "ridge_height_m",
  "description",
  "warnings",
  "links",
  // Provenance last: it is bookkeeping about the edit, not a property of
  // the site, and putting it at the top would push the real content down.
  "last_edited_by",
  "last_edited_at",
];

export function mergeSiteYaml(existingText: string | null, fields: Record<string, unknown>): string {
  const clean = stripUndefined(fields);

  if (existingText === null) {
    const ordered: Record<string, unknown> = {};
    for (const key of NEW_FILE_KEY_ORDER) {
      if (key in clean) ordered[key] = clean[key];
    }
    for (const [k, v] of Object.entries(clean)) {
      if (!(k in ordered)) ordered[k] = v;
    }
    const doc = parseDocument("{}") as Document;
    doc.contents = doc.createNode(ordered);
    return doc.toString({ lineWidth: 0 });
  }

  const doc = parseDocument(existingText);

  for (const [key, value] of Object.entries(clean)) {
    const submerge = SUBMERGED_KEYS[key];
    if (submerge && isPlainObject(value) && doc.has(key)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        doc.setIn([key, subKey], subValue);
      }
      for (const subKey of submerge.ownedOptional) {
        if (!(subKey in value) && doc.hasIn([key, subKey])) doc.deleteIn([key, subKey]);
      }
    } else {
      doc.set(key, doc.createNode(value));
    }
  }

  for (const key of EDITOR_OWNED_OPTIONAL_KEYS) {
    if (!(key in clean) && doc.has(key)) doc.delete(key);
  }

  return doc.toString({ lineWidth: 0 });
}
