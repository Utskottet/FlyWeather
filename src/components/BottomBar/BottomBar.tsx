import type { RefObject } from "react";
import { StartButton } from "../StartButton/StartButton.tsx";
import { TimeSlider } from "../TimeSlider/TimeSlider.tsx";
import { MobileTimeSlider } from "../TimeSlider/MobileTimeSlider.tsx";
import { AltitudeControl } from "../AltitudeControl/AltitudeControl.tsx";
import { MobileHeightControl } from "../AltitudeControl/MobileHeightControl.tsx";

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
 * The phone arrangement is genuinely different from the desktop one (see
 * MASTER_SPEC §15). Desktop keeps the reference image's three columns with
 * the altitude slider permanently visible. On a phone the bar floats clear
 * of the bottom gesture area and is **one slim row**: Live wind reading (a
 * large target matching the strip's height) with the scrollable day strip
 * (`MobileTimeSlider`) to its right, whose time chip pokes out above the
 * bar. Height is no longer a permanent row - it is a button below the row
 * that pops a slider out above the bar (`MobileHeightControl`). The desktop
 * `TimeSlider` range input is never used on a phone.
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
      {compact ? (
        <>
          <div className="bottom-bar-main">
            <StartButton isLiveMode={isLiveMode} onStart={onStart} />
            <div className="bottom-bar-time">
              <MobileTimeSlider hours={hours} selectedIndex={selectedIndex} onChange={onTimeChange} />
            </div>
          </div>
          {/* Height lives behind a button on a slim row below, so the bar is
              one row tall and the time chip can poke out above it. */}
          <MobileHeightControl altitudeM={altitudeM} onChange={onAltitudeChange} />
        </>
      ) : (
        <>
          <div className="bottom-bar-live">
            <StartButton isLiveMode={isLiveMode} onStart={onStart} />
          </div>
          <div className="bottom-bar-time">
            <div className="bottom-bar-section-title">Forecast time (local time)</div>
            <TimeSlider hours={hours} selectedIndex={selectedIndex} onChange={onTimeChange} />
          </div>
          <div className="bottom-bar-altitude">
            <AltitudeControl altitudeM={altitudeM} onChange={onAltitudeChange} />
          </div>
        </>
      )}
    </div>
  );
}
