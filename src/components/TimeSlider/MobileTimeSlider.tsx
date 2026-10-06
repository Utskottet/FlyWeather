import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useNow } from "../../app/useNow.ts";
import { usePrefersReducedMotion } from "../../app/usePrefersReducedMotion.ts";
import {
  MOBILE_HOUR_WIDTH_PX,
  formatSliderLabel,
  groupHoursByLocalDay,
  indexFromScrollLeft,
  nowPositionFraction,
  scrollLeftForIndex,
  tickHourLabel,
} from "../../domain/timeAxis.ts";
import {
  SOUTH_SWEDEN_REPRESENTATIVE_LOCATION,
  classifySkyBand,
  type SkyBandPhase,
} from "../../domain/skyBand.ts";
import { parseForecastHour } from "../../domain/forecastTime.ts";

export interface MobileTimeSliderProps {
  /** Windowed hours, index 0 = NOW (see useSiteForecasts). */
  hours: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

interface MobileHour {
  index: number;
  iso: string;
  /** Label ("06") only on 3-hour marks; most hours are unlabelled. */
  label: string | null;
  phase: SkyBandPhase;
  /** Full "Sat 14:00" / "NOW · Sat 14:00" text for the cell's accessible name. */
  title: string;
}

/**
 * Phone timeline (§ Startvind UX Direction), deliberately a different
 * control from the desktop `TimeSlider` - the same split Windy makes between
 * `progress-bar` and `mobile-calendar`, see
 * `docs/TIMELINE_MOBILE_RESEARCH.md`.
 *
 * The desktop range input compresses all 72 hours into ~334 px of thumb
 * travel (~4.6 px per hour), which makes a single hour on a single day an
 * uncomfortable target on a phone. Here each hour is its own
 * `MOBILE_HOUR_WIDTH_PX` cell (~13 px) inside one column per local calendar
 * day (~312 px), and the strip scrolls horizontally - so the whole horizon is
 * a few pleasant flicks and one hour is a real target. The selected hour is
 * kept centred under a fixed playhead, with the day/time chip above it,
 * mirroring the desktop slider's "the marker is the label" rule.
 *
 * Scroll position and `selectedIndex` are kept in step in both directions:
 * dragging the strip selects, and an external change (START, tapping an
 * hour) scrolls the strip. A guard flag keeps those two from fighting
 * mid-fling, the same way Windy's own strip does.
 */
export function MobileTimeSlider({ hours, selectedIndex, onChange }: MobileTimeSliderProps) {
  const now = useNow();
  const prefersReducedMotion = usePrefersReducedMotion();
  const maxIndex = Math.max(0, hours.length - 1);
  const nowFraction = nowPositionFraction(hours, now);
  const selectedDate = hours[selectedIndex] ? parseForecastHour(hours[selectedIndex]) : now;
  const label = formatSliderLabel(selectedDate, selectedIndex === 0);

  const days = useMemo(() => groupHoursByLocalDay(hours), [hours]);
  const hoursMeta = useMemo<MobileHour[]>(
    () =>
      hours.map((iso, index) => {
        const date = parseForecastHour(iso);
        const localHour = Number(tickHourLabel(date));
        return {
          index,
          iso,
          // Every third hour, like Windy's day strip - dense enough to aim
          // by, sparse enough to stay legible at ~13 px/hour.
          label: localHour % 3 === 0 ? tickHourLabel(date) : null,
          phase: classifySkyBand(date, SOUTH_SWEDEN_REPRESENTATIVE_LOCATION),
          title: formatSliderLabel(date, index === 0),
        };
      }),
    [hours],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(selectedIndex);
  const lastReportedScrollIndexRef = useRef(-1);
  const programmaticTargetRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);
  const userScrollTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => () => window.clearTimeout(userScrollTimerRef.current), []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // A scroll we started ourselves is not a user selection.
    if (programmaticTargetRef.current !== null) {
      if (Math.abs(el.scrollLeft - programmaticTargetRef.current) < 2) {
        programmaticTargetRef.current = null;
      }
      return;
    }

    // Mark the strip as user-driven for a moment after the last scroll
    // event, so the recentre effect below never yanks a fling.
    userScrollingRef.current = true;
    window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false;
    }, 160);

    const index = indexFromScrollLeft(el.scrollLeft, MOBILE_HOUR_WIDTH_PX, maxIndex);
    if (index !== selectedIndexRef.current) {
      lastReportedScrollIndexRef.current = index;
      onChange(index);
    }
  }, [maxIndex, onChange]);

  /**
   * Recentre the strip when the selection changes from outside (START, an
   * hour tap, the hidden range). A change we just reported from scrolling is
   * left where the finger put it, and an in-progress user scroll is never
   * interrupted - CSS scroll-snap settles it.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || maxIndex === 0) return;
    if (userScrollingRef.current) return;
    if (lastReportedScrollIndexRef.current === selectedIndex) {
      lastReportedScrollIndexRef.current = -1;
      return;
    }

    const target = scrollLeftForIndex(selectedIndex, MOBILE_HOUR_WIDTH_PX);
    if (Math.abs(el.scrollLeft - target) < 1) return;

    programmaticTargetRef.current = target;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left: target, behavior: prefersReducedMotion ? "auto" : "smooth" });
    } else {
      // jsdom (unit tests) has no Element.scrollTo.
      el.scrollLeft = target;
    }
    const clear = window.setTimeout(() => {
      programmaticTargetRef.current = null;
    }, 600);
    return () => window.clearTimeout(clear);
  }, [selectedIndex, maxIndex, prefersReducedMotion]);

  const nowLeftPx =
    nowFraction === null ? null : nowFraction * maxIndex * MOBILE_HOUR_WIDTH_PX + MOBILE_HOUR_WIDTH_PX / 2;

  return (
    <div className="mobile-timeline" data-testid="time-slider">
      <div className="mobile-timeline-chip" data-testid="time-slider-label">
        {label}
      </div>
      <div
        className="mobile-timeline-scroll"
        data-testid="mobile-timeline-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        role="group"
        aria-label="Forecast timeline - scroll horizontally to change the hour"
      >
        <div className="mobile-timeline-content">
          <div className="mobile-timeline-days" aria-hidden="true">
            {days.map((day) => (
              <div
                key={day.key}
                className="mobile-timeline-day"
                style={{ width: day.indices.length * MOBILE_HOUR_WIDTH_PX }}
              >
                {day.weekday} {day.dayOfMonth}
              </div>
            ))}
          </div>
          <div className="mobile-timeline-hours">
            {hoursMeta.map((hour) => (
              <button
                key={hour.iso}
                type="button"
                className={`mobile-timeline-hour mobile-timeline-hour--${hour.phase}${
                  hour.index === selectedIndex ? " mobile-timeline-hour--selected" : ""
                }`}
                style={{ width: MOBILE_HOUR_WIDTH_PX, flexBasis: MOBILE_HOUR_WIDTH_PX }}
                data-testid="mobile-timeline-hour"
                data-index={hour.index}
                aria-label={hour.title}
                aria-current={hour.index === selectedIndex ? "true" : undefined}
                onClick={() => onChange(hour.index)}
              >
                {hour.label !== null && <span className="mobile-timeline-hour-label">{hour.label}</span>}
                <span className="mobile-timeline-hour-tick" />
              </button>
            ))}
            {nowLeftPx !== null && (
              <div
                className="mobile-timeline-now"
                data-testid="time-slider-now-marker"
                style={{ left: nowLeftPx }}
              />
            )}
          </div>
        </div>
      </div>
      {/* Keeps keyboard/assistive-tech access to the exact same value the
          scroll strip writes - the same index, no separate state. */}
      <input
        type="range"
        className="mobile-timeline-range-sr"
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
