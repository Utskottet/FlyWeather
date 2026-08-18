import { formatSliderLabel } from "../../domain/timeAxis.ts";

export interface TimeSliderProps {
  /** Windowed hours, index 0 = NOW (see useSiteForecasts). */
  hours: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export function TimeSlider({ hours, selectedIndex, onChange }: TimeSliderProps) {
  const now = new Date();
  const maxIndex = Math.max(0, hours.length - 1);
  const selectedDate = hours[selectedIndex] ? new Date(hours[selectedIndex]) : now;
  const label = formatSliderLabel(selectedDate, now, selectedIndex === 0);

  return (
    <div className="time-slider" data-testid="time-slider">
      <div className="time-slider-top">
        <button
          type="button"
          className="time-slider-now-button"
          onClick={() => onChange(0)}
          disabled={selectedIndex === 0}
          data-testid="time-slider-now-button"
        >
          NOW
        </button>
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
    </div>
  );
}
