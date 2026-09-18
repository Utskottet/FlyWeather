import { useState } from "react";
import { AirspaceToggle } from "../AirspaceToggle/AirspaceToggle.tsx";
import { RoadsToggle } from "../RoadsToggle/RoadsToggle.tsx";
import { RaspControl } from "../RaspControl/RaspControl.tsx";
import type { RaspParamKey } from "../../domain/soaring.ts";

export interface MapLayersPanelProps {
  showAirspace: boolean;
  onAirspaceChange: (show: boolean) => void;
  showRasp: boolean;
  onRaspChange: (show: boolean) => void;
  selectedRaspParam: RaspParamKey;
  onRaspParamChange: (key: RaspParamKey) => void;
  availableRaspParams: RaspParamKey[];
  showRoads: boolean;
  onRoadsChange: (show: boolean) => void;
  /** Open by default on desktop (the reference image shows the panel standing open); closed on a phone, where the map needs the room. */
  defaultOpen: boolean;
}

/**
 * The single organised map-layer panel of § Startvind UX Direction -
 * replaces the loose vertical stack of individual pills that used to sit
 * top-left. Every overlay lives here, one switch row each, in the
 * reference image's order.
 *
 * RASP keeps its own associated submenu (the parameter selector appears
 * under its row the moment RASP is on and vanishes when it is off) rather
 * than spreading four more permanent rows through the panel - the same
 * rule as before, now inside the panel instead of beside it.
 */
export function MapLayersPanel({
  showAirspace,
  onAirspaceChange,
  showRasp,
  onRaspChange,
  selectedRaspParam,
  onRaspParamChange,
  availableRaspParams,
  showRoads,
  onRoadsChange,
  defaultOpen,
}: MapLayersPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="map-layers-panel" data-testid="map-layers-panel">
      <button
        type="button"
        className="map-layers-panel-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="map-layers-toggle"
      >
        <span>Map layers</span>
        <span className="map-layers-panel-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="map-layers-panel-body" data-testid="map-layers-panel-body">
          <AirspaceToggle show={showAirspace} onChange={onAirspaceChange} variant="switch" />
          <RaspControl
            show={showRasp}
            onChange={onRaspChange}
            selectedParam={selectedRaspParam}
            onParamChange={onRaspParamChange}
            availableParams={availableRaspParams}
            variant="switch"
          />
          <RoadsToggle show={showRoads} onChange={onRoadsChange} variant="switch" />
        </div>
      )}
    </section>
  );
}
