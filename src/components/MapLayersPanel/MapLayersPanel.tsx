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
  /** Open by default on desktop (the reference image shows the panel standing open). Ignored when compact. */
  defaultOpen: boolean;
  /** Phone layout: no panel, no title, no disclosure - see below. */
  compact?: boolean;
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
  compact = false,
}: MapLayersPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  /**
   * On a phone the panel stops being a panel.
   *
   * A titled, collapsible box costs a header row, a disclosure tap and a
   * dropdown that overlays the map - three things to get past before you
   * can toggle a layer, on the screen with least room for any of them. The
   * switches go inline instead: always visible, always one tap, no
   * chrome around them. "Map layers" as a heading told you nothing the
   * switches do not.
   *
   * Roads is dropped entirely here rather than shrunk. It is the least
   * used of the three and the only one that is purely orientation rather
   * than flying information, so it is what a small screen can afford to
   * lose. Its state stays wired through, so a wider window still has it.
   */
  if (compact) {
    return (
      <section className="map-layers-panel map-layers-panel-compact" data-testid="map-layers-panel">
        <div className="map-layers-panel-body" data-testid="map-layers-panel-body">
          <AirspaceToggle show={showAirspace} onChange={onAirspaceChange} variant="pill" />
          <RaspControl
            show={showRasp}
            onChange={onRaspChange}
            selectedParam={selectedRaspParam}
            onParamChange={onRaspParamChange}
            availableParams={availableRaspParams}
            variant="pill"
          />
        </div>
      </section>
    );
  }

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
