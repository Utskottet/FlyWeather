import { altitudeFractionToM, altitudeMToFraction, formatAltitudeLabel, SURFACE_ALTITUDE_M } from "../../domain/altitudeAxis.ts";
import { MODEL_HEIGHTS_M } from "../../domain/types.ts";

export interface AltitudeSliderProps {
  altitudeM: number;
  onChange: (altitudeM: number) => void;
}

// Tick marks at Surface + every native backend height (§ UPPVIND recovery
// milestone: Surface/50/100/150/250/350/450/600/800/1000/1250/1500/1750/
// 2000m) - a <datalist> only draws visual snap-hint ticks, it does NOT quantize the
// input's value, so everything between ticks stays freely selectable and
// still drives real continuous U/V interpolation (heightInterpolation.ts),
// never a hard snap to just these 8 values.
const TICK_ALTITUDES_M = [SURFACE_ALTITUDE_M, ...MODEL_HEIGHTS_M];

/**
 * Single nonlinear slider replacing the old binary Surface/Soaring-height
 * toggle (§ FlyWeather Interaction Model). `altitudeM` is the single
 * source of truth; the range input's own position is always derived from
 * it via altitudeMToFraction, never tracked separately.
 *
 * Capped at ALTITUDE_SLIDER_MAX_M (== ALTITUDE_MAX_REAL_DATA_M, 2000m - §
 * UPPVIND recovery milestone, the backend's own highest published height)
 * - § FlyWeather Mobile UI Correction's original reasoning still applies:
 * nothing above the real data ceiling is selectable.
 */
export function AltitudeSlider({ altitudeM, onChange }: AltitudeSliderProps) {
  const label = formatAltitudeLabel(altitudeM);

  return (
    <div className="altitude-slider" data-testid="altitude-slider">
      <input
        type="range"
        className="altitude-slider-range"
        min={0}
        max={1}
        step={0.001}
        list="altitude-slider-ticks"
        value={altitudeMToFraction(altitudeM)}
        onChange={(e) => onChange(altitudeFractionToM(Number(e.target.value)))}
        aria-label="Altitude above ground level"
        data-testid="altitude-slider-range"
      />
      <datalist id="altitude-slider-ticks">
        {TICK_ALTITUDES_M.map((m) => (
          <option key={m} value={altitudeMToFraction(m)} label={formatAltitudeLabel(m)} />
        ))}
      </datalist>
      <span className="altitude-slider-label" data-testid="altitude-slider-label">
        {label}
      </span>
    </div>
  );
}
