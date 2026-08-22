/**
 * Types and pure logic for the RASP/soaring overlay - consumes
 * FlyWeather-Soaring's versioned product contract (see that repo's
 * docs/PRODUCT_CONTRACT.md) as an opaque, external static file. This app
 * never knows DMI parameter IDs, GRIB internals, or the W* formula - only
 * this shape (§ "FlyWeather must never contain the meteorological
 * calculations").
 */

export interface SoaringColorStop {
  value: number;
  color: string;
}

export interface SoaringParameterTimeEntry {
  validTime: string; // ISO-8601 UTC
  raster: string; // relative to the manifest's own base URL
  numeric: string;
}

export interface SoaringParameter {
  label: string;
  technicalLabel: string;
  unit: string;
  grid: {
    bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
    cols: number;
    rows: number;
  };
  colorScale: SoaringColorStop[];
  validTimes: string[];
  files: SoaringParameterTimeEntry[];
}

export interface SoaringManifest {
  schemaVersion: number;
  product: string;
  source: {
    provider: string;
    model: string;
    modelRun: string; // ISO-8601 UTC - distinct from any individual validTime
    generatedAt: string; // ISO-8601 UTC
  };
  region: { id: string; bbox: [number, number, number, number] };
  parameters: Record<string, SoaringParameter>;
  attribution: string[];
}

/**
 * The four RASP parameter keys FlyWeather-Soaring's manifest publishes
 * (see that repo's cli.py PARAMETER_SPECS) - kept as a literal union here
 * rather than `string` so the parameter selector/legend can be exhaustive.
 */
export type RaspParamKey = "wstar" | "thermal_top" | "hcrit" | "cloudbase";

export const RASP_PARAM_KEYS: RaspParamKey[] = ["wstar", "thermal_top", "hcrit", "cloudbase"];

/**
 * The only tolerance rule this app defines for matching its own selected
 * slider instant against the manifest's published validTimes - the
 * manifest itself has no opinion on tolerance (docs/PRODUCT_CONTRACT.md:
 * "that's its own policy applied to this list"). 30 minutes: both DMI's
 * and this app's own forecast data are hourly-aligned, so an exact match
 * is the common case when data exists for that hour at all; this just
 * absorbs any minor generation-timing slop without ever silently
 * substituting a genuinely different hour's forecast.
 */
export const RASP_TIME_TOLERANCE_MINUTES = 30;

/**
 * Nearest published validTime to `targetIso`, or null if nothing is
 * within tolerance - never returns a distant match silently, per the
 * task's explicit "never silently show a forecast from the wrong hour"
 * requirement. Never throws on an unparseable entry - such an entry is
 * just never a viable match, not a fatal error for the whole lookup.
 */
export function findNearestValidTime(
  validTimes: string[],
  targetIso: string,
  toleranceMinutes: number = RASP_TIME_TOLERANCE_MINUTES,
): string | null {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return null;

  const toleranceMs = toleranceMinutes * 60 * 1000;
  let best: { time: string; diff: number } | null = null;

  for (const t of validTimes) {
    const ms = new Date(t).getTime();
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (best === null || diff < best.diff) {
      best = { time: t, diff };
    }
  }

  if (best === null || best.diff > toleranceMs) return null;
  return best.time;
}

/** Looks up the file entry for a matched validTime - kept separate from
 * findNearestValidTime so the "which time matched" and "what file does
 * that time map to" concerns stay independently testable. */
export function findFileForValidTime(
  parameter: SoaringParameter,
  validTime: string,
): SoaringParameterTimeEntry | null {
  return parameter.files.find((f) => f.validTime === validTime) ?? null;
}
