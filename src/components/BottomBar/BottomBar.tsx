import type { RefObject } from "react";
import { StartButton } from "../StartButton/StartButton.tsx";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { AltitudeControl } from "../AltitudeControl/AltitudeControl.tsx";

export interface BottomBarProps {
  isLiveMode: boolean;
  onStart: () => void;
  hours: string[];
  selectedIndex: number;
  onTimeChange: (index: number) => void;
  altitudeM: number;
  onAltitudeChange: (altitudeM: number) => void;
  compact: boolean;
  /** Measured by SiteMap so the site sheet and the RASP legend can sit exactly on top of this bar instead of behind it. */
  barRef: RefObject<HTMLDivElement | null>;
}

/**
 * Bottom bar (§ Startvind UX Direction): Current Wind, the forecast
 * timeline, and altitude - forecast navigation only. No map layer, no site
 * selection and no brand mark lives down here.
 *
 * Phone arrangement is not the desktop one scaled down: Current Wind and
 * the collapsible HEIGHT control share one short top row and the timeline
 * takes the full width below them, rather than three columns squeezed
 * side by side. Desktop gets the reference image's three columns with the
 * altitude slider permanently visible.
 */
export function BottomBar({
  isLiveMode,
  onStart,
  hours,
  selectedIndex,
  onTimeChange,
  altitudeM,
  onAltitudeChange,
  compact,
  barRef,
}: BottomBarProps) {
  return (
    <div className={`bottom-bar${compact ? " bottom-bar-compact" : ""}`} data-testid="bottom-bar" ref={barRef}>
      <div className="bottom-bar-live">
        <StartButton isLiveMode={isLiveMode} onStart={onStart} />
        {/* Altitude runs alongside time on a phone rather than hiding
            behind a HEIGHT button. A linear slider like the timeline,
            deliberately shorter: a secondary control that is always
            readable beats a primary-looking button you have to open to
            find out what it is set to. */}
        {compact && (
          <div className="bottom-bar-altitude-inline">
            <AltitudeControl altitudeM={altitudeM} onChange={onAltitudeChange} />
          </div>
        )}
      </div>
      <div className="bottom-bar-time">
        <div className="bottom-bar-section-title">Forecast time (local time)</div>
        <TimeSlider hours={hours} selectedIndex={selectedIndex} onChange={onTimeChange} />
      </div>
      {!compact && (
        <div className="bottom-bar-altitude">
          <AltitudeControl altitudeM={altitudeM} onChange={onAltitudeChange} />
        </div>
      )}
    </div>
  );
}
