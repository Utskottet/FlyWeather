import { PressToggle } from "../PressToggle/PressToggle.tsx";
import { RaspParamSelector } from "../RaspParamSelector/RaspParamSelector.tsx";
import type { RaspParamKey } from "../../domain/soaring.ts";

export interface RaspControlProps {
  show: boolean;
  onChange: (show: boolean) => void;
  selectedParam: RaspParamKey;
  onParamChange: (key: RaspParamKey) => void;
  availableParams: RaspParamKey[];
}

/**
 * RASP is different from Roads/Airspace (§ FlyWeather GUI Reorganization +
 * Coherent Height Wind item 6): it has subparameters, so its submenu is
 * "directly associated with the RASP control" itself rather than spread
 * permanently across the toolbar. One tap turns the overlay on AND reveals
 * the parameter selector together - there is no separate expand/collapse
 * state to manage; turning RASP off hides the submenu automatically.
 */
export function RaspControl({ show, onChange, selectedParam, onParamChange, availableParams }: RaspControlProps) {
  return (
    <div className="tool-stack-item">
      <PressToggle
        label="RASP"
        pressed={show}
        onChange={onChange}
        testId="rasp-toggle"
        trailing={
          <span className="tool-stack-chevron" aria-hidden="true">
            ▸
          </span>
        }
      />
      {show && (
        <div className="tool-stack-submenu" data-testid="rasp-param-popover">
          <RaspParamSelector selected={selectedParam} onChange={onParamChange} availableParams={availableParams} />
        </div>
      )}
    </div>
  );
}
