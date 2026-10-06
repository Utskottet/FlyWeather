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
import { forecastHourMs, parseForecastHour } from "../../domain/forecastTime.ts";

export interface MobileTimeSliderProps {
  /** Windowed hours, index 0 = NOW (see useSiteForecasts). */
  hours: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

interface MobileCell {
  key: string;
  /** "past" cells are today's elapsed hours shown for context but not a
   * selectable forecast position. */
  kind: "past" | "forecast";
  /** Forecast index, or -1 for a past cell. */
  index: number;
  /** Label ("06") only on 3-hour marks; most cells are unlabelled. */
  label: string | null;
  phase: SkyBandPhase;
  /** Full "Sat 14:00" / "NOW · Sat 14:00" text for the cell's accessible name. */
  title: string;
}

interface DayHeader {
  key: string;
  label: string;
  /** Cell-coordinate start and length, so the label can be absolutely
   * positioned over the day's own span. */
  startCell: number;
  count: number;
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
 * day (~312 px), and the strip scrolls horizontally - so the whole horizon
 * is a few pleasant flicks and one hour is a real target. The selected hour
 * is kept centred under a fixed playhead, with the day/time chip above it,
 * mirroring the desktop slider's "the marker is the label" rule.
 *
 * Today starts at local midnight, not at NOW: the hours already elapsed are
 * rendered as non-selectable "past" cells so the current day reads as one
 * continuous column instead of a strip that begins in mid-air (Windy does
 * the same). They are never snap targets and can't be selected.
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

  const hourWidth = MOBILE_HOUR_WIDTH_PX;
  const firstHourMs = hours.length > 0 ? forecastHourMs(hours[0]) : 0;
  // Local hour-of-day of the first forecast hour == how many cells of the
  // current day come before it.
  const leadCells = hours.length > 0 ? Number(tickHourLabel(parseForecastHour(hours[0]))) : 0;
  const totalCells = leadCells + hours.length;

  const days = useMemo(() => groupHoursByLocalDay(hours), [hours]);

  const hoursMeta = useMemo<MobileCell[]>(
    () =>
      hours.map((iso, index) => {
        const date = parseForecastHour(iso);
        const localHour = Number(tickHourLabel(date));
        return {
          key: iso,
          kind: "forecast",
          index,
          // Every third hour, like Windy's day strip - dense enough to aim
          // by, sparse enough to stay legible at ~13 px/hour.
          label: localHour % 3 === 0 ? tickHourLabel(date) : null,
          phase: classifySkyBand(date, SOUTH_SWEDEN_REPRESENTATIVE_LOCATION),
          title: formatSliderLabel(date, index === 0),
        };
      }),
    [hours],
  );

  const cells = useMemo<MobileCell[]>(() => {
    const past: MobileCell[] = [];
    for (let cell = 0; cell < leadCells; cell++) {
      const date = new Date(firstHourMs - (leadCells - cell) * 3_600_000);
      past.push({
        key: `past-${cell}`,
        kind: "past",
        index: -1,
        label: Number(tickHourLabel(date)) % 3 === 0 ? tickHourLabel(date) : null,
        phase: classifySkyBand(date, SOUTH_SWEDEN_REPRESENTATIVE_LOCATION),
        title: "",
      });
    }
    return [...past, ...hoursMeta];
  }, [hoursMeta, leadCells, firstHourMs]);

  const dayHeaders = useMemo<DayHeader[]>(
    () =>
      days.map((day, dayIndex) => {
        const startCell = dayIndex === 0 ? 0 : leadCells + day.indices[0];
        const endCell = leadCells + day.indices[day.indices.length - 1] + 1;
        return {
          key: day.key,
          label: `${day.weekday} ${day.dayOfMonth}`,
          startCell,
          count: endCell - startCell,
        };
      }),
    [days, leadCells],
  );

  const selectedCell = leadCells + selectedIndex;
  const activeDay =
    dayHeaders.find((day) => selectedCell >= day.startCell && selectedCell < day.startCell + day.count) ??
    dayHeaders[0];

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

    const index = indexFromScrollLeft(el.scrollLeft, hourWidth, maxIndex, leadCells);
    if (index !== selectedIndexRef.current) {
      lastReportedScrollIndexRef.current = index;
      onChange(index);
    }
  }, [hourWidth, leadCells, maxIndex, onChange]);

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

    const target = scrollLeftForIndex(selectedIndex, hourWidth, leadCells);
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
  }, [selectedIndex, maxIndex, hourWidth, leadCells, prefersReducedMotion]);

  const nowLeftPx =
    nowFraction === null ? null : (leadCells + nowFraction * maxIndex) * hourWidth + hourWidth / 2;

  return (
    <div className="mobile-timeline" data-testid="time-slider">
      <div
        className={`mobile-timeline-chip${selectedIndex === 0 ? " mobile-timeline-chip--now" : ""}`}
        data-testid="time-slider-label"
      >
        {label}
      </div>
      {/* The day of the centred hour, pinned at the strip's left. A label
          that scrolls with its day column gets clipped the moment the day
          boundary sits off-screen; this always reads clearly. */}
      {activeDay && (
        <div className="mobile-timeline-day-badge" data-testid="time-slider-day-badge">
          {activeDay.label}
        </div>
      )}
      <div
        className="mobile-timeline-scroll"
        data-testid="mobile-timeline-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        role="group"
        aria-label="Forecast timeline - scroll horizontally to change the hour"
      >
        <div className="mobile-timeline-content">
          <div className="mobile-timeline-hours" style={{ width: totalCells * hourWidth }}>
            <div className="mobile-timeline-daylayer" aria-hidden="true">
              {dayHeaders.map((day) => (
                <div
                  key={day.key}
                  className="mobile-timeline-day-divider"
                  style={{ left: day.startCell * hourWidth }}
                />
              ))}
            </div>
            {cells.map((cell) =>
              cell.kind === "past" ? (
                <div
                  key={cell.key}
                  className={`mobile-timeline-hour mobile-timeline-hour--past mobile-timeline-hour--${cell.phase}${
                    cell.label !== null ? " mobile-timeline-hour--mark" : ""
                  }`}
                  style={{ width: hourWidth, flexBasis: hourWidth }}
                  aria-hidden="true"
                >
                  {cell.label !== null && <span className="mobile-timeline-hour-label">{cell.label}</span>}
                  <span className="mobile-timeline-hour-tick" />
                </div>
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  className={`mobile-timeline-hour mobile-timeline-hour--${cell.phase}${
                    cell.label !== null ? " mobile-timeline-hour--mark" : ""
                  }${cell.index === selectedIndex ? " mobile-timeline-hour--selected" : ""}`}
                  style={{ width: hourWidth, flexBasis: hourWidth }}
                  data-testid="mobile-timeline-hour"
                  data-index={cell.index}
                  aria-label={cell.title}
                  aria-current={cell.index === selectedIndex ? "true" : undefined}
                  onClick={() => onChange(cell.index)}
                >
                  {cell.label !== null && <span className="mobile-timeline-hour-label">{cell.label}</span>}
                  <span className="mobile-timeline-hour-tick" />
                </button>
              ),
            )}
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
      <div className="mobile-timeline-playhead" aria-hidden="true" />
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
