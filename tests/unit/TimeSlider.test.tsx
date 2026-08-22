import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TimeSlider } from "../../src/components/TimeSlider/TimeSlider.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function hoursFromNow(count: number): string[] {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 3_600_000).toISOString());
}

describe("TimeSlider", () => {
  it("shows NOW at index 0", () => {
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getByTestId("time-slider-label").textContent).toBe("NOW");
  });

  it("calls onChange with the new index when the range input moves", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={onChange} />,
    );
    fireEvent.change(getByTestId("time-slider-range"), { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("caps the range input's max at the available hours", () => {
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(10)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getByTestId("time-slider-range").getAttribute("max")).toBe("9");
  });

  it("renders one graduation tick per hour across the full range (Block 12)", () => {
    const { container } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(container.querySelectorAll(".time-slider-tick")).toHaveLength(73);
  });

  it("renders at least one day-boundary tick with a weekday label across 73 hours", () => {
    const { getByTestId, container } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getByTestId("time-slider-ticks")).toBeTruthy();
    const dayTicks = container.querySelectorAll(".time-slider-tick-day");
    // 73 hours always spans at least one local midnight
    expect(dayTicks.length).toBeGreaterThanOrEqual(1);
    expect(dayTicks[0].querySelector(".time-slider-tick-label")?.textContent).toMatch(/^[A-Z]{3}$/);
  });
});

describe("TimeSlider NOW marker", () => {
  it("positions the NOW marker independently of the selected index", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z")); // exactly on an hourly tick
    const hours = hoursFromNow(73); // built from the faked "now", so hours[0] = 12:00Z

    const { getByTestId, rerender } = render(
      <TimeSlider hours={hours} selectedIndex={0} onChange={() => {}} />,
    );
    const marker = () => (getByTestId("time-slider-now-marker") as HTMLElement).style.left;
    expect(marker()).toBe("0%"); // now == hours[0] exactly

    // Moving the selection alone must never move the NOW marker - it's a
    // real-clock position, not a function of what's selected.
    rerender(<TimeSlider hours={hours} selectedIndex={40} onChange={() => {}} />);
    expect(marker()).toBe("0%");
  });

  it("moves the NOW marker as real time passes, without touching the selection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    const hours = hoursFromNow(73);
    const onChange = vi.fn();

    const { getByTestId } = render(<TimeSlider hours={hours} selectedIndex={5} onChange={onChange} />);
    const markerLeft = () => parseFloat((getByTestId("time-slider-now-marker") as HTMLElement).style.left);
    const initial = markerLeft();
    expect(initial).toBeCloseTo(0, 5);

    act(() => {
      vi.setSystemTime(new Date("2026-08-18T13:30:00.000Z")); // +90 minutes
      vi.advanceTimersByTime(60_000); // fires useNow's interval tick
    });

    expect(markerLeft()).toBeGreaterThan(initial);
    expect(onChange).not.toHaveBeenCalled(); // advancing the clock never selects anything
  });

  it("does not render a NOW marker when there's no hour data yet", () => {
    const { queryByTestId } = render(<TimeSlider hours={[]} selectedIndex={0} onChange={() => {}} />);
    expect(queryByTestId("time-slider-now-marker")).toBeNull();
  });
});

describe("TimeSlider day/night sky band", () => {
  it("renders a real gradient background, not a flat placeholder", () => {
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    const band = getByTestId("time-slider-sky-band") as HTMLElement;
    expect(band.style.background).toContain("linear-gradient");
  });

  it("renders numeric hour labels at six-hour ticks, e.g. 06/12/18", () => {
    const { container } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    const hourLabels = Array.from(container.querySelectorAll(".time-slider-tick-hour-label")).map(
      (el) => el.textContent,
    );
    expect(hourLabels.length).toBeGreaterThan(0);
    for (const label of hourLabels) {
      expect(label).toMatch(/^\d{2}$/);
    }
  });

  it("shows transparent (no band) rather than crashing when there's no hour data", () => {
    const { getByTestId } = render(<TimeSlider hours={[]} selectedIndex={0} onChange={() => {}} />);
    const band = getByTestId("time-slider-sky-band") as HTMLElement;
    expect(band.style.background).toBe("transparent");
  });
});
