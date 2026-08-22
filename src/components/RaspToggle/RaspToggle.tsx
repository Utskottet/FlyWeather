import { PressToggle } from "../PressToggle/PressToggle.tsx";

export interface RaspToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

/** Single-label pressed-state overlay control for the RASP layer (§ FlyWeather Next UI) - label always reads "RASP". Default OFF, wired in SiteMap.tsx. */
export function RaspToggle({ show, onChange }: RaspToggleProps) {
  return <PressToggle label="RASP" pressed={show} onChange={onChange} testId="rasp-toggle" />;
}
