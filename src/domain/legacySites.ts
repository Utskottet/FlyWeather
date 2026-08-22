import { z } from "zod";

/**
 * The pre-migration SITES.md schema (schema_version 1), kept verbatim and
 * isolated here purely so scripts/migrate-sites.ts can parse+validate the
 * legacy fenced-YAML catalogue one last time (§ FlyWeather Site Catalogue
 * Migration). Not used by the live app - domain/sites.ts and
 * domain/siteFile.ts are the current, authoritative types/schema. Do not
 * add new features here; this file exists only until SITES.md itself is
 * retired.
 */

const legacyDegSchema = z.number().min(0).max(360);

const legacySectorSchema = z
  .object({
    from_deg: legacyDegSchema,
    to_deg: legacyDegSchema,
  })
  .refine((s) => s.from_deg !== s.to_deg, {
    message: "sector from_deg and to_deg must not be equal (zero-width sector)",
  });

const legacyCoordinatesSchema = z
  .object({
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
    verified: z.boolean(),
    source: z.string().optional(),
  })
  .refine((c) => !c.verified || (c.lat !== null && c.lon !== null), {
    message: "coordinates.verified=true requires non-null lat and lon",
  });

const legacyRoseSchema = z.object({
  verified: z.boolean(),
  green: z.array(legacySectorSchema),
  orange: z.array(legacySectorSchema),
});

const legacyWindSpeedSchema = z
  .object({
    verified: z.boolean(),
    good_min_ms: z.number().nonnegative().optional(),
    good_max_ms: z.number().nonnegative().optional(),
    maybe_min_ms: z.number().nonnegative().optional(),
    maybe_max_ms: z.number().nonnegative().optional(),
    hard_max_gust_ms: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (w) =>
      !w.verified ||
      (w.good_min_ms !== undefined &&
        w.good_max_ms !== undefined &&
        w.maybe_min_ms !== undefined &&
        w.maybe_max_ms !== undefined),
    {
      message:
        "wind_speed.verified=true requires good_min_ms, good_max_ms, maybe_min_ms and maybe_max_ms",
    },
  );

const legacySoaringHeightSchema = z.object({
  agl_m: z.number().positive().nullable(),
  verified: z.boolean(),
});

const legacyLiveSourceSchema = z.object({
  provider: z.string(),
  station_id: z.string().nullable().optional(),
  priority: z.number().int().positive(),
  verified: z.boolean(),
  note: z.string().optional(),
});

const legacyRestrictionSchema = z.object({
  type: z.string(),
  severity: z.enum(["hard", "warning", "local_rule"]).or(z.string()),
  message: z.string(),
  status_provider: z.string().nullable().optional(),
});

export const legacySiteSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  name: z.string().min(1),
  short_name: z.string().optional(),
  country: z.string().min(1),
  type: z.enum(["hang", "winch", "paramotor", "school", "other"]),
  coordinates: legacyCoordinatesSchema,
  source_direction_label: z.string().optional(),
  ridge_height_m: z.number().nullable().optional(),
  rose: legacyRoseSchema,
  wind_speed: legacyWindSpeedSchema,
  soaring_height: legacySoaringHeightSchema,
  live_sources: z.array(legacyLiveSourceSchema),
  description: z.string().min(1),
  restrictions: z.array(legacyRestrictionSchema).optional(),
  cps_url: z.string().optional(),
});

export const legacySitesDataSchema = z
  .object({
    schema_version: z.number().int().positive(),
    defaults: z.object({
      timezone: z.string(),
      units: z.string(),
      live_fresh_minutes: z.number().positive(),
      live_stale_minutes: z.number().positive(),
    }),
    sites: z.array(legacySiteSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    data.sites.forEach((site, index) => {
      if (seen.has(site.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate site id "${site.id}" (first seen at sites[${seen.get(site.id)}], again at sites[${index}])`,
          path: ["sites", index, "id"],
        });
      } else {
        seen.set(site.id, index);
      }
    });
  });

export type LegacySector = z.infer<typeof legacySectorSchema>;
export type LegacySite = z.infer<typeof legacySiteSchema>;
export type LegacySitesData = z.infer<typeof legacySitesDataSchema>;

export function extractYamlBlock(markdown: string): string {
  const match = markdown.match(/```yaml\n([\s\S]*?)```/);
  if (!match) {
    throw new Error("No fenced ```yaml block found");
  }
  return match[1];
}
