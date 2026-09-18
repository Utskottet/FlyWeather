import { PressToggle, type PressToggleVariant } from "../PressToggle/PressToggle.tsx";

export interface RoadsToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
  /** "switch" inside the Map layers panel (§ Startvind UX Direction); "pill" is the standalone form. */
  variant?: PressToggleVariant;
}

/** Single-label pressed-state toggle replacing the old 3-way Relief/Topo/Map selector (§ FlyWeather Interaction Model) - label always reads "Roads". Off = Relief (default), on = Topo. */
export function RoadsToggle({ show, onChange, variant }: RoadsToggleProps) {
  return <PressToggle label="Roads" pressed={show} onChange={onChange} testId="roads-toggle" variant={variant} />;
}
