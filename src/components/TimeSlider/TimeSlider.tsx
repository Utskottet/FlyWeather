import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const label = formatSliderLabel(selectedDate, selectedIndex === 0);
  // Astronomical, not re-sampled every render - only recomputed when the
  // actual hour range changes (`hours` is stable between NOW-marker ticks).
  const skyBandGradient = useMemo(
    () => skyBandCssGradient(buildSkyBandBlocks(hours, SOUTH_SWEDEN_REPRESENTATIVE_LOCATION)),
    [hours],
  );

  // The marker's position along the track, 0..1.
  const selectedFraction = maxIndex === 0 ? 0 : selectedIndex / maxIndex;

  // Both widths are measured rather than assumed because the label's own
  // width changes with its text ("NOW · Fri 20:00" is much wider than
  // "Sun 02:00"), and the track's width changes with the viewport. With
  // them, the chip can be clamped inside the track at both ends - at
  // index 0 an unclamped chip hung half off the left edge of a phone -
  // while its pointer stays on the thumb, which is the whole point of
  // putting the label on the marker.
  const trackRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  useLayoutEffect(() => {
    const track = trackRef.current;
    const label = labelRef.current;
    if (!track || !label) return;
    const observer = new ResizeObserver(() => {
      setTrackWidth(track.clientWidth);
      setLabelWidth(label.offsetWidth);
    });
    observer.observe(track);
    observer.observe(label);
    setTrackWidth(track.clientWidth);
    setLabelWidth(label.offsetWidth);
    // No dependency on the label text: the observer is watching the label
    // element itself, so a wider label ("NOW · Fri 20:00") re-measures on
    // its own rather than re-subscribing on every drag step.
    return () => observer.disconnect();
  }, []);

  // Kept in step with --thumb-size in App.css: the thumb's centre can only
  // travel between half a thumb in from each end of the track.
  const THUMB_SIZE_PX = 26;
  const thumbCentre =
    trackWidth === 0 ? 0 : THUMB_SIZE_PX / 2 + selectedFraction * (trackWidth - THUMB_SIZE_PX);
  const labelHalf = labelWidth / 2;
  const labelCentre = Math.min(Math.max(thumbCentre, labelHalf), Math.max(labelHalf, trackWidth - labelHalf));
  // Where the chip's pointer sits inside the chip, so it keeps aiming at
  // the thumb even when the chip itself has been pushed inwards.
  const pointerOffset = thumbCentre - labelCentre + labelHalf;

  /**
   * The chip is a drag handle in its own right, not just a readout.
   *
   * It is the largest, most obviously grabbable thing on the timeline and
   * it states the very value being changed, so reaching for it is the
   * natural move - especially with a thumb on a phone, where the 26px
   * slider dot is the smaller target of the two. The range input keeps
   * working exactly as before; this adds a second way in rather than
   * replacing the first.
   *
   * Geometry is the inverse of thumbCentre above: the thumb's centre can
   * only travel between half a thumb in from each end, so the same inset
   * has to come back out here or dragging the chip would land the thumb
   * slightly off from the pointer.
   */
  function indexFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track || maxIndex === 0) return 0;
    const rect = track.getBoundingClientRect();
    const travel = rect.width - THUMB_SIZE_PX;
    if (travel <= 0) return 0;
    const fraction = (clientX - rect.left - THUMB_SIZE_PX / 2) / travel;
    return Math.round(Math.min(Math.max(fraction, 0), 1) * maxIndex);
  }

  function handleLabelPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Left button / touch / pen only - a right-click should open a context
    // menu, not silently scrub the forecast.
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    onChange(indexFromClientX(event.clientX));
  }

  function handleLabelPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    // Only while actually dragging: without the capture check this would
    // scrub the timeline on a passing mouse.
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onChange(indexFromClientX(event.clientX));
  }

  function handleLabelPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="time-slider" data-testid="time-slider">
      {/* The selected time rides on the thumb rather than sitting in a
          corner: you are dragging a labelled marker that always states the
          day and the clock time, not a bare dot whose meaning you have to
          find somewhere else on screen. */}
      <div className="time-slider-track" ref={trackRef}>
        <div
          className="time-slider-label"
          data-testid="time-slider-label"
          ref={labelRef}
          onPointerDown={handleLabelPointerDown}
          onPointerMove={handleLabelPointerMove}
          onPointerUp={handleLabelPointerUp}
          onPointerCancel={handleLabelPointerUp}
          role="presentation"
          style={
            {
              left: `${labelCentre}px`,
              "--pointer-offset": `${pointerOffset}px`,
            } as React.CSSProperties
          }
        >
          {label}
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
