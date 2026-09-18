import { PressToggle, type PressToggleVariant } from "../PressToggle/PressToggle.tsx";

export interface AirspaceToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
  /** "switch" inside the Map layers panel (§ Startvind UX Direction); "pill" is the standalone form. */
  variant?: PressToggleVariant;
}

/** Single-label pressed-state toggle (§ FlyWeather Next UI) - label always reads "Airspace", state shown only via aria-pressed + the .active class. */
export function AirspaceToggle({ show, onChange, variant }: AirspaceToggleProps) {
  return <PressToggle label="Airspace" pressed={show} onChange={onChange} testId="airspace-toggle" variant={variant} />;
}
