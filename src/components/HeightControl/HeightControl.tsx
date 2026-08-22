import { useState } from "react";
import { AltitudeSlider } from "../AltitudeSlider/AltitudeSlider.tsx";
import { SURFACE_ALTITUDE_M } from "../../domain/altitudeAxis.ts";

export interface HeightControlProps {
  altitudeM: number;
  onChange: (altitudeM: number) => void;
}

/**
 * HEIGHT is a collapsible map tool, not a permanent slider (§ FlyWeather
 * GUI Reorganization + Coherent Height Wind item 7) - tapping the button
 * reveals/hides a compact AltitudeSlider. Collapsing is purely a UI-visibility
 * concern (`expanded`, local state) and never resets the selected altitude -
 * only START does that (via the `altitudeM` prop itself, owned by SiteMap).
 * The button label discloses the active altitude ("HEIGHT 70m") so the
 * current selection is never ambiguous while collapsed.
 */
export function HeightControl({ altitudeM, onChange }: HeightControlProps) {
  const [expanded, setExpanded] = useState(false);
  const active = altitudeM !== SURFACE_ALTITUDE_M;
  const label = active ? `HEIGHT ${altitudeM}m` : "HEIGHT";

  return (
    <div className="tool-stack-item">
      <button
        type="button"
        className={`press-toggle tool-stack-button${active ? " active" : ""}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        data-testid="height-control-button"
      >
        {label}
        <span className="tool-stack-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="tool-stack-submenu" data-testid="height-control-slider">
          <AltitudeSlider altitudeM={altitudeM} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
