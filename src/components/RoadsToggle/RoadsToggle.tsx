import { PressToggle } from "../PressToggle/PressToggle.tsx";

export interface RoadsToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

/** Single-label pressed-state toggle replacing the old 3-way Relief/Topo/Map selector (§ FlyWeather Interaction Model) - label always reads "Roads". Off = Relief (default), on = Topo. */
export function RoadsToggle({ show, onChange }: RoadsToggleProps) {
  return <PressToggle label="Roads" pressed={show} onChange={onChange} testId="roads-toggle" />;
}
