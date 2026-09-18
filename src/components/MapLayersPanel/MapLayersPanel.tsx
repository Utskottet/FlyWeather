import { AirspaceToggle } from "../AirspaceToggle/AirspaceToggle.tsx";
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
}

/**
 * The map's overlay switches: Airspace and RASP, inline, on every screen.
 *
 * This was a titled, collapsible panel. All of that is gone - the heading
 * "Map layers" told you nothing the two switches do not, and a disclosure
 * put a tap between the map and a toggle on the screen with least room for
 * one. Two switches do not need a container to explain them.
 *
 * Roads is gone too, on every screen rather than only on a phone. Note
 * that its toggle never only controlled roads: it swapped the whole map
 * style, which also carried contour lines, contour labels and place names
 * (see mapStyles.ts's buildTopoStyle). Those go with it. The map is
 * unchanged from how it looked with the toggle off, which is how it
 * shipped by default - but if place names are wanted back, that is a style
 * change rather than a toggle.
 *
 * RASP keeps its own parameter selector, which appears when the overlay is
 * on and hides when it is off - no separate disclosure to manage.
 */
export function MapLayersPanel({
  showAirspace,
  onAirspaceChange,
  showRasp,
  onRaspChange,
  selectedRaspParam,
  onRaspParamChange,
  availableRaspParams,
}: MapLayersPanelProps) {
  return (
    <section className="map-layers-panel" data-testid="map-layers-panel">
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
