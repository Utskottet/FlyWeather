import { RASP_PARAM_KEYS, type RaspParamKey } from "../../domain/soaring.ts";

export interface RaspParamSelectorProps {
  selected: RaspParamKey;
  onChange: (key: RaspParamKey) => void;
  /** Keys not present in the loaded manifest show disabled, mirroring
   * MapModeToggle's "Coming soon" pattern - never silently broken. */
  availableParams?: RaspParamKey[];
}

// Plain, non-jargon labels for the selector itself; technical names (W*,
// Hcrit, LCL) appear only as legend subtext, per the task's explicit
// "don't expose internal meteorological jargon unnecessarily" instruction.
const LABELS: Record<RaspParamKey, string> = {
  wstar: "Thermals",
  thermal_top: "Thermal top",
  hcrit: "Usable height",
  cloudbase: "Cloudbase",
};

export function RaspParamSelector({ selected, onChange, availableParams = RASP_PARAM_KEYS }: RaspParamSelectorProps) {
  return (
    <div className="rasp-param-selector" role="group" aria-label="RASP parameter" data-testid="rasp-param-selector">
      {RASP_PARAM_KEYS.map((key) => {
        const available = availableParams.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={selected === key ? "active" : ""}
            disabled={!available}
            onClick={() => available && onChange(key)}
            data-testid={`rasp-param-${key}`}
            title={available ? undefined : "Not available in this forecast"}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
