import type { MapMode } from "./mapStyles.ts";

export interface MapModeToggleProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
  /** Modes not yet implemented (Block 14b/14c) show as disabled rather than silently broken. */
  availableModes?: MapMode[];
}

const LABELS: Record<MapMode, string> = { relief: "Relief", topo: "Topo", map: "Map" };

export function MapModeToggle({ mode, onChange, availableModes = ["relief"] }: MapModeToggleProps) {
  return (
    <div className="map-mode-toggle" role="group" aria-label="Map mode" data-testid="map-mode-toggle">
      {(["relief", "topo", "map"] as const).map((m) => {
        const available = availableModes.includes(m);
        return (
          <button
            key={m}
            type="button"
            className={mode === m ? "active" : ""}
            disabled={!available}
            onClick={() => available && onChange(m)}
            data-testid={`map-mode-${m}`}
            title={available ? undefined : "Coming soon"}
          >
            {LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
