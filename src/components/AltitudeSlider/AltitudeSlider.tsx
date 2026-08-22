import {
  ALTITUDE_MAX_REAL_DATA_M,
  altitudeFractionToM,
  altitudeMToFraction,
  formatAltitudeLabel,
} from "../../domain/altitudeAxis.ts";

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
 * Above ALTITUDE_MAX_REAL_DATA_M (180m, Open-Meteo's real ceiling) there is
 * no genuine per-site wind data - the label discloses this honestly rather
 * than silently showing 180m data as if it were the requested altitude.
 */
export function AltitudeSlider({ altitudeM, onChange }: AltitudeSliderProps) {
  const isClamped = altitudeM > ALTITUDE_MAX_REAL_DATA_M;
  const label = isClamped
    ? `${formatAltitudeLabel(altitudeM)} requested - showing ${formatAltitudeLabel(ALTITUDE_MAX_REAL_DATA_M)} (highest available)`
    : formatAltitudeLabel(altitudeM);

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
