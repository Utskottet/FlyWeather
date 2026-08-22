import { MODEL_HEIGHTS_M } from "./types.ts";

/**
 * The real ceiling of per-site wind-at-height data (Open-Meteo's hourly
 * API only exposes 10/80/120/180m AGL - see openMeteoProvider.ts).
 *
 * The slider's own max (below) is capped at exactly this value (§
 * FlyWeather Mobile UI Correction) - a prior version let the slider run to
 * 1500m and silently/verbosely fell back to 180m data above that, which
 * the task called out as misleading. There is nothing above this to
 * select until real DMI vertical-wind products exist, so it's simply not
 * offered.
 */
export const ALTITUDE_MAX_REAL_DATA_M = Math.max(...MODEL_HEIGHTS_M);

/** 0 = Surface, the slider's special endpoint - never passed through the piecewise segments below. */
export const SURFACE_ALTITUDE_M = 0;

/** The slider never offers more than genuinely exists - see ALTITUDE_MAX_REAL_DATA_M above. */
export const ALTITUDE_SLIDER_MAX_M = ALTITUDE_MAX_REAL_DATA_M;

interface AltitudeSegment {
  fFrom: number;
  fTo: number;
  mFrom: number;
  mTo: number;
}

/**
 * Nonlinear slider mapping (§ FlyWeather Interaction Model, re-tuned for
 * the 180m cap in the Mobile UI Correction pass): low altitudes get a
 * large physical portion of the slider for fine control (40/50/70m must
 * all be easily dialable), the 120/180m end of the real range compresses
 * into a smaller portion. Segments meet exactly at their shared boundaries
 * so the mapping is continuous, not just piecewise-plausible.
 */
const SEGMENTS: AltitudeSegment[] = [
  { fFrom: 0.0, fTo: 0.55, mFrom: 0, mTo: 70 },
  { fFrom: 0.55, fTo: 0.8, mFrom: 70, mTo: 120 },
  { fFrom: 0.8, fTo: 1.0, mFrom: 120, mTo: ALTITUDE_SLIDER_MAX_M },
];

const ALTITUDE_ROUNDING_M = 5;

/** Slider fraction (0..1) -> altitude in meters AGL, rounded to the nearest 5m. */
export function altitudeFractionToM(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  const segment = SEGMENTS.find((s) => f <= s.fTo) ?? SEGMENTS[SEGMENTS.length - 1];
  const span = segment.fTo - segment.fFrom;
  const t = span === 0 ? 0 : (f - segment.fFrom) / span;
  const raw = segment.mFrom + t * (segment.mTo - segment.mFrom);
  return Math.round(raw / ALTITUDE_ROUNDING_M) * ALTITUDE_ROUNDING_M;
}

/** Exact inverse of altitudeFractionToM, used to position the controlled range input from the current altitude. */
export function altitudeMToFraction(m: number): number {
  const clamped = Math.min(ALTITUDE_SLIDER_MAX_M, Math.max(0, m));
  const segment = SEGMENTS.find((s) => clamped <= s.mTo) ?? SEGMENTS[SEGMENTS.length - 1];
  const span = segment.mTo - segment.mFrom;
  const t = span === 0 ? 0 : (clamped - segment.mFrom) / span;
  return segment.fFrom + t * (segment.fTo - segment.fFrom);
}

/** "Surface" at 0, otherwise e.g. "70 m AGL" - never a bare number, per the task. */
export function formatAltitudeLabel(m: number): string {
  return m === SURFACE_ALTITUDE_M ? "Surface" : `${m} m AGL`;
}
