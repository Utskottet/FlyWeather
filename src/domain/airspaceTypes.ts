/**
 * OpenAIP's numeric airspace enum -> human labels, per the official
 * schema at https://api.core.openaip.net/api/schemas/response/airspace/
 * airspace-schema.json (fetched and cross-checked directly, not
 * guessed - the raw API returns only numeric codes with no built-in
 * labels, e.g. `type: 21` is "Gliding Sector"). Shared between
 * scripts/collect-airspaces.ts (which bakes these labels into the
 * generated static file) and any frontend code that needs to interpret
 * the raw numeric `type` field for styling.
 */

export const AIRSPACE_TYPE_LABELS: Record<number, string> = {
  0: "Other",
  1: "Restricted",
  2: "Danger",
  3: "Prohibited",
  4: "CTR",
  5: "TMZ",
  6: "RMZ",
  7: "TMA",
  8: "TRA",
  9: "TSA",
  10: "FIR",
  11: "UIR",
  12: "ADIZ",
  13: "ATZ",
  14: "MATZ",
  15: "Airway",
  16: "MTR",
  17: "Alert area",
  18: "Warning area",
  19: "Protected area",
  20: "HTZ",
  21: "Gliding sector",
  22: "TRP",
  23: "TIZ",
  24: "TIA",
  25: "MTA",
  26: "CTA",
  27: "ACC sector",
  28: "Aerial sporting/recreational",
  29: "Low altitude overflight restriction",
  30: "MRT",
  31: "TFR",
  32: "VFR sector",
  33: "FIS sector",
  34: "LTA",
  35: "UTA",
  36: "MCTR",
};

export const ICAO_CLASS_LABELS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "C",
  3: "D",
  4: "E",
  5: "F",
  6: "G",
  8: "Unclassified / SUA",
};

export const ALTITUDE_UNIT_LABELS: Record<number, string> = {
  0: "m",
  1: "ft",
  6: "FL",
};

export const REFERENCE_DATUM_LABELS: Record<number, string> = {
  0: "GND",
  1: "MSL",
  2: "STD",
};

export interface AltitudeLimit {
  value: number;
  unit: number;
  referenceDatum: number;
}

/** e.g. {value:1600,unit:1,referenceDatum:1} -> "1600 ft MSL"; FL uses no unit suffix since "FL" already implies it, e.g. "FL90". */
export function formatAltitudeLimit(limit: AltitudeLimit): string {
  const unitLabel = ALTITUDE_UNIT_LABELS[limit.unit] ?? `unit${limit.unit}`;
  if (limit.unit === 6) {
    return `FL${limit.value}`;
  }
  const datumLabel = REFERENCE_DATUM_LABELS[limit.referenceDatum] ?? `datum${limit.referenceDatum}`;
  return `${limit.value} ${unitLabel} ${datumLabel}`;
}

/**
 * Broad visual category so the map style can use a handful of colors
 * instead of 37 - restricted/danger/prohibited in red (hazard to
 * avoid), CTR/TMA/control-zone types in blue (controlled airspace,
 * needs clearance not necessarily forbidden), gliding/aerial-sport in
 * green (directly relevant to paragliding, not a hazard), everything
 * else in gray (informational).
 */
export type AirspaceCategory = "hazard" | "controlled" | "sport" | "other";

const HAZARD_TYPES = new Set([1, 2, 3]); // Restricted, Danger, Prohibited
const CONTROLLED_TYPES = new Set([4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 20, 23, 24, 26, 36]); // CTR/TMZ/RMZ/TMA/TRA/TSA/FIR/UIR/ATZ/MATZ/HTZ/TIZ/TIA/CTA/MCTR
const SPORT_TYPES = new Set([21, 28]); // Gliding sector, aerial sporting/recreational

export function categorizeAirspaceType(type: number): AirspaceCategory {
  if (HAZARD_TYPES.has(type)) return "hazard";
  if (CONTROLLED_TYPES.has(type)) return "controlled";
  if (SPORT_TYPES.has(type)) return "sport";
  return "other";
}
