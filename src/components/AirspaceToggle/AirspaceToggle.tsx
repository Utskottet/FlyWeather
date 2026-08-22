import { PressToggle } from "../PressToggle/PressToggle.tsx";

export interface AirspaceToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

/** Single-label pressed-state toggle (§ FlyWeather Next UI) - label always reads "Airspace", state shown only via aria-pressed + the .active class. */
export function AirspaceToggle({ show, onChange }: AirspaceToggleProps) {
  return <PressToggle label="Airspace" pressed={show} onChange={onChange} testId="airspace-toggle" />;
}
