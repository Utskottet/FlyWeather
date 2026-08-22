export interface RaspToggleProps {
  show: boolean;
  onChange: (show: boolean) => void;
}

/** ON/OFF overlay control for the RASP W* (thermal strength) layer - mirrors AirspaceToggle's structure exactly. Default OFF, wired in SiteMap.tsx. */
export function RaspToggle({ show, onChange }: RaspToggleProps) {
  return (
    <div className="rasp-toggle" role="group" aria-label="RASP" data-testid="rasp-toggle">
      <button type="button" className={!show ? "active" : ""} onClick={() => onChange(false)} data-testid="rasp-off">
        RASP off
      </button>
      <button type="button" className={show ? "active" : ""} onClick={() => onChange(true)} data-testid="rasp-on">
        RASP on
      </button>
    </div>
  );
}
