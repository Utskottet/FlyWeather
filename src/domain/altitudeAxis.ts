import { MODEL_HEIGHTS_M } from "./types.ts";

/**
 * The real ceiling of per-site wind-at-height data - the backend's
 * highest published height (§ UPPVIND recovery milestone: DWD ICON-EU
 * via Open-Meteo on the backend now covers Surface-2000m, superseding
 * the earlier 450m DMI HARMONIE DINI ceiling).
 *
 * The slider's own max (below) is capped at exactly this value (§
 * FlyWeather Mobile UI Correction's original reasoning still applies) -
 * offering a slider range beyond what any provider can actually answer
 * is misleading, so it's simply not offered.
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
 * Nonlinear slider mapping, re-tuned for the 2000m cap (§ UPPVIND
 * recovery milestone): low altitudes still get a large physical portion
 * of the slider for fine control - most ridge-soaring/thermal use sits
 * under 150m - with movement per slider-fraction getting progressively
 * coarser at altitude, four segments instead of three so the 450-2000m
 * span (where the old 3-segment shape would have crammed 1650m into the
 * last fifth of the slider) still gets two intermediate steps. Segment
 * boundaries land exactly on real backend heights (150/450/1000/2000)
 * and meet exactly at their shared boundaries so the mapping is
 * continuous, not just piecewise-plausible.
 */
const SEGMENTS: AltitudeSegment[] = [
  { fFrom: 0.0, fTo: 0.5, mFrom: 0, mTo: 150 },
  { fFrom: 0.5, fTo: 0.75, mFrom: 150, mTo: 450 },
  { fFrom: 0.75, fTo: 0.9, mFrom: 450, mTo: 1000 },
  { fFrom: 0.9, fTo: 1.0, mFrom: 1000, mTo: ALTITUDE_SLIDER_MAX_M },
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
