import { useMemo } from "react";
import { useNow } from "../../app/useNow.ts";
import { classifyTick, formatSliderLabel, nowPositionFraction, tickDayLabel, tickHourLabel } from "../../domain/timeAxis.ts";
import { SOUTH_SWEDEN_REPRESENTATIVE_LOCATION, buildSkyBandBlocks, skyBandCssGradient } from "../../domain/skyBand.ts";

export interface TimeSliderProps {
  /** Windowed hours, index 0 = NOW (see useSiteForecasts). */
  hours: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export function TimeSlider({ hours, selectedIndex, onChange }: TimeSliderProps) {
  // Ticks every minute so the NOW marker below visibly drifts between
  // hourly ticks as real time passes - independent of `selectedIndex`,
  // which only changes when the user actually moves the slider.
  const now = useNow();
  const maxIndex = Math.max(0, hours.length - 1);
  const nowFraction = nowPositionFraction(hours, now);
  const selectedDate = hours[selectedIndex] ? new Date(hours[selectedIndex]) : now;
  const label = formatSliderLabel(selectedDate, now, selectedIndex === 0);
  // Astronomical, not re-sampled every render - only recomputed when the
  // actual hour range changes (`hours` is stable between NOW-marker ticks).
  const skyBandGradient = useMemo(
    () => skyBandCssGradient(buildSkyBandBlocks(hours, SOUTH_SWEDEN_REPRESENTATIVE_LOCATION)),
    [hours],
  );

  return (
    <div className="time-slider" data-testid="time-slider">
      <div className="time-slider-top">
        {/* The old in-timeline NOW button (time-only reset) is superseded
            by the global START button, which resets time+altitude+live-wind
            together (§ FlyWeather Interaction Model) - keeping both would be
            redundant. This label-only row still shows the selected time. */}
        <div className="time-slider-label" data-testid="time-slider-label">
          {label}
        </div>
      </div>
      <input
        type="range"
        className="time-slider-range"
        min={0}
        max={maxIndex}
        step={1}
        value={selectedIndex}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Selected forecast time"
        data-testid="time-slider-range"
      />
      <div className="time-slider-ticks" data-testid="time-slider-ticks" aria-hidden="true">
        <div
          className="time-slider-sky-band"
          style={{ background: skyBandGradient }}
          data-testid="time-slider-sky-band"
        />
        {hours.map((h, i) => {
          const level = classifyTick(new Date(h));
          const leftPercent = maxIndex === 0 ? 0 : (i / maxIndex) * 100;
          return (
            <div
              key={h}
              className={`time-slider-tick time-slider-tick-${level}`}
              style={{ left: `${leftPercent}%` }}
              data-testid={`time-slider-tick-${level}`}
            >
              {level === "day" && <span className="time-slider-tick-label">{tickDayLabel(new Date(h))}</span>}
              {level === "six-hour" && (
                <span className="time-slider-tick-hour-label">{tickHourLabel(new Date(h))}</span>
              )}
            </div>
          );
        })}
        {nowFraction !== null && (
          // Real clock position - deliberately separate from the selected-time
          // thumb above. Moving the slider never moves this; only real time does.
          <div className="time-slider-now-marker" style={{ left: `${nowFraction * 100}%` }} data-testid="time-slider-now-marker">
            <span className="time-slider-now-marker-label">NOW</span>
          </div>
        )}
      </div>
    </div>
  );
}
