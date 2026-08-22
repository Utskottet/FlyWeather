import { PressToggle } from "../PressToggle/PressToggle.tsx";

export interface WindToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

/** Single-label pressed-state toggle for the animated wind field (§ FlyWeather Next UI) - label always reads "Wind". Default ON, mirrors AirspaceToggle/RaspToggle's structure. */
export function WindToggle({ show, onChange }: WindToggleProps) {
  return <PressToggle label="Wind" pressed={show} onChange={onChange} testId="wind-toggle" />;
}
