import { z } from "zod";
import { hasOverlappingBands } from "./bandOverlap";

/**
 * This experiment's own site schema - deliberately separate from the
 * production ../../../src/domain/siteFile.ts (never imported by, or
 * importing from, that file). A superset of the production descriptive
 * fields plus `bands`, a new authored multi-color wind-sector concept that
 * has no production equivalent yet. Expect this to keep changing as the
 * editor UX gets shaken out - that's fine, it's isolated from real data.
 *
 * `verified` fields are never user-toggled - each Fields component (see
 * components/SiteForm/{Coordinates,Wind,Station}Fields.tsx) derives it from
 * whether the field was actually filled in. They stay in the schema because
 * production's own siteFileSchema uses them.
 *
 * A band is always a green "core" range (from_deg/to_deg) - no more
 * per-band color choice. `margin_under_deg`/`margin_over_deg` (default 0,
 * optional to fill in) instead author how many degrees of orange margin to
 * derive on each side - margin_under_deg extends backward from from_deg,
 * margin_over_deg extends forward from to_deg (e.g. core 130-250 with
 * margin_under_deg 5 and margin_over_deg 10 means orange 125-130 and
 * 250-260). This mirrors production's own real model much more closely
 * than the old explicit-orange-band version did (domain/flyability.ts
 * already derives a marginal zone around one authored sector at runtime -
 * this just makes the margin width authorable per side instead of a fixed
 * constant). Multiple green cores on one site are valid (e.g. two separate
 * good-direction ranges) and must not overlap each other (see
 * domain/bandOverlap.ts, checked on the core from_deg/to_deg only - margins
 * are cosmetic/derived and not included in the overlap check) - enforced
 * here so even a raw API call can't create an invalid site, not just the UI.
 */

export const bandSchema = z
  .object({
    id: z.string().min(1),
    from_deg: z.number().min(0).max(360),
    to_deg: z.number().min(0).max(360),
    margin_under_deg: z.number().min(0).max(360).default(0),
    margin_over_deg: z.number().min(0).max(360).default(0),
  })
  .refine((b) => b.from_deg !== b.to_deg, {
    message: "band from_deg and to_deg must not be equal (zero-width band)",
  });

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  verified: z.boolean(),
});

/**
 * Wind speed uses the same shape as `bandSchema` above: a green core
 * (`min_ms`/`max_ms` - the speeds the site actually reads as good) plus
 * two optional orange margins authored per side. `margin_under_ms`
 * extends orange downward from `min_ms`, `margin_over_ms` upward from
 * `max_ms`, both defaulting to 0. Example: a 5-7 m/s green core with
 * `margin_over_ms: 2` means 8.5 m/s reads orange but 10 m/s reads red.
 *
 * This is a real extension of production, not a restatement of it:
 * `../../../src/domain/flyability.ts`'s `computeSpeedFit` is two-tier
 * today - inside the band is good, everything else is bad, with no
 * marginal speed tier at all. It also answers a standing `BACKLOG.md`
 * item: Klamby's real numbers (green 0-5, orange 5-6, red 6+) had to be
 * approximated by folding the orange tier into red, and are expressible
 * here exactly as min 0 / max 5 / margin_over_ms 1.
 *
 * Margins never affect `verified`, which stays derived from whether the
 * core min/max were actually typed in - an authored margin is optional
 * extra precision, not evidence that the band itself was confirmed.
 */
export const windSchema = z.object({
  verified: z.boolean(),
  min_ms: z.number().nonnegative().optional(),
  max_ms: z.number().nonnegative().optional(),
  margin_under_ms: z.number().nonnegative().default(0),
  margin_over_ms: z.number().nonnegative().default(0),
});

export const stationSchema = z.object({
  name: z.string().optional(),
  provider: z.string().optional(),
  station_id: z.string().optional(),
  url: z.string().optional(),
  verified: z.boolean(),
  note: z.string().optional(),
});

export const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

export const pilotLevelSchema = z.enum(["easy", "medium", "difficult"]);

const bandsField = z.array(bandSchema).default([]);

function checkNoOverlaps(bands: z.infer<typeof bandsField>, ctx: z.RefinementCtx) {
  if (hasOverlappingBands(bands)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bands"], message: "bands must not overlap each other" });
  }
}

const siteDraftObjectSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().min(1),
  status: z.enum(["active", "hidden"]).default("active"),
  name: z.string().min(1),
  short_name: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  group: z.enum(["ridge", "winch"]).optional(),
  coordinates: coordinatesSchema,
  bands: bandsField,
  wind: windSchema,
  station: stationSchema.optional(),
  pilot_level: pilotLevelSchema.optional(),
  ridge_height_m: z.number().nullable().optional(),
  description: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  links: z.array(linkSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const siteDraftSchema = siteDraftObjectSchema.superRefine((draft, ctx) => checkNoOverlaps(draft.bands, ctx));

export type Band = z.infer<typeof bandSchema>;
export type SiteDraft = z.infer<typeof siteDraftObjectSchema>;

/** Shape accepted from the client on create - everything except server-assigned fields. */
export const siteDraftInputSchema = siteDraftObjectSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((draft, ctx) => checkNoOverlaps(draft.bands, ctx));

export type SiteDraftInput = Omit<SiteDraft, "id" | "createdAt" | "updatedAt">;

export function emptyDraftInput(): SiteDraftInput {
  return {
    schema_version: 1,
    status: "active",
    name: "",
    coordinates: { lat: null, lon: null, verified: false },
    bands: [],
    // Margins start at 0 rather than undefined so the form's number inputs
    // are controlled from the first render - the schema default is there
    // for raw API calls, not for the UI to lean on.
    wind: { verified: false, margin_under_ms: 0, margin_over_ms: 0 },
    warnings: [],
    links: [],
    description: "",
  };
}
