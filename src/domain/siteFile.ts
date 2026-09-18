import { z } from "zod";

/**
 * Schema for one human-authored site YAML file under sites/**\/*.yaml
 * (§ FlyWeather Site Catalogue Migration - replaces the old monolithic
 * SITES.md fenced-YAML block, see domain/legacySites.ts for that
 * superseded schema). Deliberately small: country/region/group/active
 * status are derived from the file's own path (parseSitePath below), not
 * authored here, and free-form pilot knowledge belongs in `description`/
 * `warnings`, not a new structured field, unless FlyWeather actually
 * needs to calculate/filter/validate/display it.
 */

const degSchema = z.number().min(0).max(360);

/**
 * Width of an authored marginal ("orange") zone, in degrees. Capped at 180
 * rather than 360 because a margin wider than a half-circle would wrap past
 * the range's opposite edge and start overlapping itself, which no site
 * means and which would silently turn most of the compass marginal.
 */
const marginDegSchema = z.number().min(0).max(180);

/**
 * One clockwise range, from_deg to to_deg, numeric degrees. North-crossing
 * ranges are valid (e.g. 330 -> 30) - see domain/direction.ts's
 * isAngleInSector, which already handles the wraparound.
 *
 * `margin_under_deg`/`margin_over_deg` author how wide the marginal zone is
 * on each side of this range - margin_under_deg extends backward from
 * from_deg, margin_over_deg forward from to_deg. Both are OPTIONAL, and an
 * absent margin means MARGINAL_SECTOR_PADDING_DEG (11.25deg), which is
 * exactly what domain/flyability.ts applied to every site before these
 * fields existed. So a file that authors neither behaves identically to the
 * way it behaved before this field was added - the fallback is not a
 * convenience default, it is the documented previous behavior.
 *
 * Authoring them makes the rule per-site and per-side: a real ridge is not
 * symmetric, and one fixed constant could never say so.
 */
const sectorRangeSchema = z
  .object({
    from_deg: degSchema,
    to_deg: degSchema,
    margin_under_deg: marginDegSchema.optional(),
    margin_over_deg: marginDegSchema.optional(),
  })
  .refine((r) => r.from_deg !== r.to_deg, {
    message: "sector range from_deg and to_deg must not be equal (zero-width sector)",
  });

/**
 * The authoritative wind sector(s) a site can be launched in - one or more
 * non-overlapping clockwise ranges. Most sites have exactly one (a ridge
 * only faces one way); a winch site can legitimately have two
 * opposite-facing ranges (the cable can be laid out and launched from
 * either end depending on wind - real case: Klamby, 45-145deg and
 * 225-315deg). Authored either as a single `from_deg`/`to_deg` pair (the
 * common case, kept for every existing single-sector site - no migration
 * needed) or as `ranges: [{from_deg, to_deg}, ...]` for a genuinely
 * multi-sector site; both parse to the same always-array `ranges` shape
 * below, so every downstream consumer (flyability.ts, WindRose.tsx) only
 * ever deals with one shape, never a single/many special case.
 *
 * Replaces the old rose.green[]/rose.orange[] pair - see
 * SITE_MIGRATION_REPORT.md for how every site's old green/orange ranges
 * mapped onto this, and domain/flyability.ts for how the old orange
 * "marginal" zone became a uniform derived padding instead of
 * hand-authored per-site data.
 */
const singleSectorSchema = z
  .object({
    from_deg: degSchema,
    to_deg: degSchema,
    margin_under_deg: marginDegSchema.optional(),
    margin_over_deg: marginDegSchema.optional(),
    verified: z.boolean(),
  })
  .refine((s) => s.from_deg !== s.to_deg, {
    message: "sector from_deg and to_deg must not be equal (zero-width sector)",
  })
  .transform((s) => ({
    ranges: [
      {
        from_deg: s.from_deg,
        to_deg: s.to_deg,
        margin_under_deg: s.margin_under_deg,
        margin_over_deg: s.margin_over_deg,
      },
    ],
    verified: s.verified,
  }));

const multiSectorSchema = z.object({
  ranges: z.array(sectorRangeSchema).min(1),
  verified: z.boolean(),
});

export const sectorSchema = z.union([multiSectorSchema, singleSectorSchema]);

export const coordinatesSchema = z
  .object({
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
    verified: z.boolean(),
    source: z.string().optional(),
  })
  .refine((c) => !c.verified || (c.lat !== null && c.lon !== null), {
    message: "coordinates.verified=true requires non-null lat and lon",
  });

/**
 * Replaces the old wind_speed.{good,maybe}_{min,max}_ms four-number band
 * with a single min_ms/max_ms usable-wind band - safe to simplify because
 * zero sites in the pre-migration catalogue had wind_speed.verified=true,
 * so no real numeric data existed to lose (see SITE_MIGRATION_REPORT.md).
 *
 * `margin_under_ms`/`margin_over_ms` are the speed-axis counterpart to
 * sectorRangeSchema's direction margins: margin_under_ms extends the
 * marginal zone downward from min_ms, margin_over_ms upward from max_ms.
 * Both OPTIONAL, and an absent margin means 0 - which is exactly what
 * flyability.ts did before these fields existed, where the speed axis had
 * no marginal tier at all and one tenth of a m/s past max_ms was already
 * a hard no. So authoring nothing reproduces the previous behavior
 * precisely; the fallback is the documented old rule, not a guess.
 *
 * This finally makes a real site expressible. Klamby's own description has
 * carried its true numbers as prose for exactly this reason - "green 0-5
 * m/s, orange 5-6 m/s, red above 6 ... this catalogue's schema only
 * supports one min/max good band today, so orange is folded into red here"
 * - and that orange is `max_ms: 5` with `margin_over_ms: 1`.
 */
export const windSchema = z
  .object({
    verified: z.boolean(),
    min_ms: z.number().nonnegative().optional(),
    max_ms: z.number().nonnegative().optional(),
    margin_under_ms: z.number().nonnegative().optional(),
    margin_over_ms: z.number().nonnegative().optional(),
    hard_max_gust_ms: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  })
  .refine((w) => !w.verified || (w.min_ms !== undefined && w.max_ms !== undefined), {
    message: "wind.verified=true requires min_ms and max_ms",
  });

/**
 * A single live station, replacing the old live_sources[] array - every
 * site in the pre-migration catalogue had at most one live source, so
 * nothing is lost (see SITE_MIGRATION_REPORT.md). Scripts adapt this back
 * into the array shape providers/live/resolver.ts expects.
 */
export const stationSchema = z.object({
  name: z.string().optional(),
  provider: z.string().min(1),
  station_id: z.string().nullable().optional(),
  url: z.string().optional(),
  verified: z.boolean(),
  note: z.string().optional(),
});

export const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

export const imageSchema = z.object({
  url: z.string().min(1),
  caption: z.string().optional(),
  credit: z.string().optional(),
});

/**
 * Who last changed this site through the in-app editor, and when.
 *
 * OPTIONAL in the schema but REQUIRED by the editor (see
 * domain/siteEditor.ts's validateDraft). The split is deliberate: all 30
 * files pre-date the editor and have no such record, and inventing a name
 * for them would be fabricating provenance - the one thing this field
 * exists to prevent. So an absent stamp honestly means "last changed
 * before this was tracked, see git", and every edit from here on carries
 * one.
 *
 * Not a substitute for git history, which records every change including
 * hand-edits. It answers a different question: git knows who *pushed*,
 * this knows who *filled in the form*, and it travels with the data into
 * sites.json rather than living in the repo's history.
 *
 * `last_edited_at` is stamped server-side at write time
 * (scripts/siteWriterPlugin.ts), never taken from the browser - a wrong
 * clock or a form left open for an hour would otherwise record a time the
 * edit did not happen at.
 */
const editedBySchema = z
  .string()
  .min(1)
  .refine((v) => v.trim().split(/\s+/).length >= 2, {
    message: "last_edited_by should be a full name (first and last)",
  });

export const siteFileSchema = z.object({
  schema_version: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  short_name: z.string().optional(),
  coordinates: coordinatesSchema,
  sector: sectorSchema.nullable().optional(),
  wind: windSchema,
  station: stationSchema.nullable().optional(),
  pilot_level: z.string().optional(),
  ridge_height_m: z.number().nullable().optional(),
  description: z.string().min(1),
  last_edited_by: editedBySchema.optional(),
  last_edited_at: z.string().datetime().optional(),
  warnings: z.array(z.string()).optional(),
  links: z.array(linkSchema).optional(),
  images: z.array(imageSchema).optional(),
});

export type Sector = z.infer<typeof sectorSchema>;
export type SiteFile = z.infer<typeof siteFileSchema>;

export type SiteGroup = "ridge" | "winch";

/** Metadata derivable purely from a site file's path under sites/. */
export interface SitePathMetadata {
  country: string;
  region: string;
  group: SiteGroup | null;
  archived: boolean;
}

/**
 * Derives country/region/group/archived from a path like
 * "sites/se/skane/ridge/hammar.yaml" (§ FlyWeather Site Catalogue
 * Migration - "derive these properties from the file path", not authored
 * per-file). `relativePath` is expected relative to the sites/ root
 * (forward slashes). Returns null for `group` when the file sits directly
 * under archive/ (its original group isn't recoverable from the path
 * alone once archived - see SITE_MIGRATION_REPORT.md for each archived
 * site's original group at the time of migration).
 */
export function parseSitePath(relativePath: string): SitePathMetadata {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length < 4) {
    throw new Error(
      `site path "${relativePath}" is too shallow - expected <country>/<region>/<ridge|winch|archive>/<file>.yaml`,
    );
  }
  const [country, region, groupSegment] = parts;
  if (groupSegment === "archive") {
    return { country, region, group: null, archived: true };
  }
  if (groupSegment !== "ridge" && groupSegment !== "winch") {
    throw new Error(
      `site path "${relativePath}" has an unrecognized group segment "${groupSegment}" - expected "ridge", "winch", or "archive"`,
    );
  }
  return { country, region, group: groupSegment, archived: false };
}
