import { AltitudeSlider } from "../AltitudeSlider/AltitudeSlider.tsx";
import { ALTITUDE_SLIDER_MAX_M, SURFACE_ALTITUDE_M } from "../../domain/altitudeAxis.ts";

export interface AltitudeControlProps {
  altitudeM: number;
  onChange: (altitudeM: number) => void;
}

/**
 * The bottom bar's permanent altitude section (§ Startvind UX Direction) -
 * the desktop counterpart of the phone's collapsible `HeightControl`. Same
 * `AltitudeSlider`, same single `altitudeM` source of truth, same label
 * element (`altitude-slider-label`), only shown as a value box beside the
 * track; only the disclosure differs, since a desktop bottom bar has the
 * width to keep the slider visible and a phone does not.
 *
 * The title says **AGL**, not AMSL as the reference image does: altitude
 * here is height above ground level and the behaviour behind it is
 * unchanged (§7, domain/heightInterpolation.ts). Relabelling it AMSL would
 * make the app state something untrue about its own numbers - see
 * docs/DECISIONS.md.
 */
export function AltitudeControl({ altitudeM, onChange }: AltitudeControlProps) {
  return (
    <div className="altitude-control" data-testid="altitude-control">
      <div className="bottom-bar-section-title">Altitude (m AGL)</div>
      <AltitudeSlider altitudeM={altitudeM} onChange={onChange} />
      <div className="altitude-control-ends" aria-hidden="true">
        <span>{SURFACE_ALTITUDE_M}</span>
        <span>{ALTITUDE_SLIDER_MAX_M}</span>
      </div>
    </div>
  );
}
