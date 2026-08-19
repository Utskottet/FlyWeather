export interface AirspaceToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

export function AirspaceToggle({ show, onChange }: AirspaceToggleProps) {
  return (
    <div className="airspace-toggle" role="group" aria-label="Airspace" data-testid="airspace-toggle">
      <button
        type="button"
        className={!show ? "active" : ""}
        onClick={() => onChange(false)}
        data-testid="airspace-off"
      >
        Airspace off
      </button>
      <button type="button" className={show ? "active" : ""} onClick={() => onChange(true)} data-testid="airspace-on">
        Airspace on
      </button>
    </div>
  );
}
