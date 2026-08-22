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
 * The single authoritative wind sector, numeric degrees, clockwise from
 * from_deg to to_deg. North-crossing sectors are valid (e.g. 330 -> 30) -
 * see domain/direction.ts's isAngleInSector, which already handles the
 * wraparound. Replaces the old rose.green[]/rose.orange[] pair - see
 * SITE_MIGRATION_REPORT.md for how every site's old green/orange ranges
 * mapped onto this single sector, and domain/flyability.ts for how the
 * old orange "marginal" zone became a uniform derived padding instead of
 * hand-authored per-site data.
 */
export const sectorSchema = z
  .object({
    from_deg: degSchema,
    to_deg: degSchema,
    verified: z.boolean(),
  })
  .refine((s) => s.from_deg !== s.to_deg, {
    message: "sector from_deg and to_deg must not be equal (zero-width sector)",
  });

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
 */
export const windSchema = z
  .object({
    verified: z.boolean(),
    min_ms: z.number().nonnegative().optional(),
    max_ms: z.number().nonnegative().optional(),
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
