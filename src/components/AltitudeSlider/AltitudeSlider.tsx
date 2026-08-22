import { altitudeFractionToM, altitudeMToFraction, formatAltitudeLabel } from "../../domain/altitudeAxis.ts";

export interface AltitudeSliderProps {
  altitudeM: number;
  onChange: (altitudeM: number) => void;
}

/**
 * Single nonlinear slider replacing the old binary Surface/Soaring-height
 * toggle (§ FlyWeather Interaction Model). `altitudeM` is the single
 * source of truth; the range input's own position is always derived from
 * it via altitudeMToFraction, never tracked separately.
 *
 * Capped at ALTITUDE_SLIDER_MAX_M (== ALTITUDE_MAX_REAL_DATA_M, 180m) - §
 * FlyWeather Mobile UI Correction removed the old 1500m range and its
 * "requested - showing 180m" fallback disclosure entirely, since nothing
 * above the real data ceiling is selectable anymore.
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
        value={altitudeMToFraction(altitudeM)}
        onChange={(e) => onChange(altitudeFractionToM(Number(e.target.value)))}
        aria-label="Altitude above ground level"
        data-testid="altitude-slider-range"
      />
      <span className="altitude-slider-label" data-testid="altitude-slider-label">
        {label}
      </span>
    </div>
  );
}
