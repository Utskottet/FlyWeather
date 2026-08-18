import { z } from "zod";

const degSchema = z.number().min(0).max(360);

const sectorSchema = z
  .object({
    from_deg: degSchema,
    to_deg: degSchema,
  })
  .refine((s) => s.from_deg !== s.to_deg, {
    message: "sector from_deg and to_deg must not be equal (zero-width sector)",
  });

const coordinatesSchema = z
  .object({
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
    verified: z.boolean(),
    source: z.string().optional(),
  })
  .refine((c) => !c.verified || (c.lat !== null && c.lon !== null), {
    message: "coordinates.verified=true requires non-null lat and lon",
  });

const roseSchema = z.object({
  verified: z.boolean(),
  green: z.array(sectorSchema),
  orange: z.array(sectorSchema),
});

const windSpeedSchema = z
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

const soaringHeightSchema = z.object({
  agl_m: z.number().positive().nullable(),
  verified: z.boolean(),
});

const liveSourceSchema = z.object({
  provider: z.string(),
  station_id: z.string().nullable().optional(),
  priority: z.number().int().positive(),
  verified: z.boolean(),
  note: z.string().optional(),
});

const restrictionSchema = z.object({
  type: z.string(),
  severity: z.enum(["hard", "warning", "local_rule"]).or(z.string()),
  message: z.string(),
  status_provider: z.string().nullable().optional(),
});

export const siteSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  name: z.string().min(1),
  short_name: z.string().optional(),
  country: z.string().min(1),
  type: z.enum(["hang", "winch", "paramotor", "school", "other"]),
  coordinates: coordinatesSchema,
  source_direction_label: z.string().optional(),
  ridge_height_m: z.number().nullable().optional(),
  rose: roseSchema,
  wind_speed: windSpeedSchema,
  soaring_height: soaringHeightSchema,
  live_sources: z.array(liveSourceSchema),
  description: z.string().min(1),
  restrictions: z.array(restrictionSchema).optional(),
  cps_url: z.string().optional(),
});

export const sitesDataSchema = z
  .object({
    schema_version: z.number().int().positive(),
    defaults: z.object({
      timezone: z.string(),
      units: z.string(),
      live_fresh_minutes: z.number().positive(),
      live_stale_minutes: z.number().positive(),
    }),
    sites: z.array(siteSchema),
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

export type Sector = z.infer<typeof sectorSchema>;
export type Site = z.infer<typeof siteSchema>;
export type SitesData = z.infer<typeof sitesDataSchema>;
