import { stringify } from "yaml";
import type { SiteDraftInput } from "./siteDraft";
import { describeSpeedBands } from "./speedFit";

/**
 * Exportable shape: the editable form fields plus an id - deliberately NOT
 * the full SiteDraft, since createdAt/updatedAt have no production
 * equivalent and are never part of the exported YAML. `id` is optional so
 * an unsaved new draft can still be previewed/exported before it has a
 * server-assigned id.
 */
export type ExportableDraft = SiteDraftInput & { id?: string };

/**
 * Maps a draft to YAML shaped like the production schema
 * (../../../src/domain/siteFile.ts), for manual review/hand-porting only -
 * nothing here writes into sites/**. `bands[]` still has no exact
 * production equivalent (production's marginal-zone padding is a fixed
 * runtime constant, not authored per-side like margin_under_deg/
 * margin_over_deg here, and production only supports one sector's worth of
 * ranges, not several independent green cores), so it's appended as a
 * commented block rather than silently dropped or force-fit into `sector`.
 */
export function draftToYaml(draft: ExportableDraft): string {
  const wind = draft.wind;
  const doc: Record<string, unknown> = {
    schema_version: 2,
    id: draft.id ?? "(unsaved)",
    name: draft.name,
    ...(draft.short_name ? { short_name: draft.short_name } : {}),
    coordinates: draft.coordinates,
    // Margins are split out of `wind` for the same reason bands are held
    // back below: production's windSchema has no margin_*_ms keys, and
    // zod strips unknown keys silently rather than erroring - so emitting
    // them inside `wind:` would look accepted while doing nothing at all.
    wind: { verified: wind.verified, ...(wind.min_ms !== undefined ? { min_ms: wind.min_ms } : {}), ...(wind.max_ms !== undefined ? { max_ms: wind.max_ms } : {}) },
    ...(draft.station ? { station: draft.station } : {}),
    ...(draft.pilot_level ? { pilot_level: draft.pilot_level } : {}),
    ...(draft.ridge_height_m != null ? { ridge_height_m: draft.ridge_height_m } : {}),
    description: draft.description,
    ...(draft.warnings.length ? { warnings: draft.warnings } : {}),
    ...(draft.links.length ? { links: draft.links } : {}),
  };

  let yaml = stringify(doc, { lineWidth: 0 });

  if (draft.bands.length > 0) {
    const bandLines = draft.bands
      .map((b) => `#   - from_deg: ${b.from_deg}, to_deg: ${b.to_deg}, margin_under_deg: ${b.margin_under_deg}, margin_over_deg: ${b.margin_over_deg}`)
      .join("\n");
    yaml += [
      "",
      "# bands (experimental, no exact production equivalent yet - see",
      "# admin-experiment/src/domain/siteDraft.ts. Production instead authors",
      "# one `sector` and derives its marginal zone at runtime from a fixed",
      "# constant, not per-side authored margins - a human needs to decide",
      "# how/whether these map onto that before this site goes live):",
      bandLines,
      "",
    ].join("\n");
  }

  if (wind.margin_under_ms > 0 || wind.margin_over_ms > 0) {
    yaml += [
      "",
      "# wind margins (experimental, no production equivalent yet - see",
      "# admin-experiment/src/domain/speedFit.ts. Production's computeSpeedFit",
      "# is two-tier on the speed axis: inside min_ms/max_ms is good and",
      "# everything else is bad, with no marginal tier to put these in. A",
      "# human needs to decide whether production grows a third tier before",
      "# this site goes live):",
      `#   margin_under_ms: ${wind.margin_under_ms}, margin_over_ms: ${wind.margin_over_ms}`,
      `#   => ${describeSpeedBands(wind)}`,
      "",
    ].join("\n");
  }

  return yaml;
}

export function downloadYaml(draft: ExportableDraft): void {
  const blob = new Blob([draftToYaml(draft)], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${draft.id || "site"}.yaml`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyYamlToClipboard(draft: ExportableDraft): Promise<void> {
  await navigator.clipboard.writeText(draftToYaml(draft));
}
