import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MobileTimeSlider } from "../../src/components/TimeSlider/MobileTimeSlider.tsx";
import { MOBILE_HOUR_WIDTH_PX } from "../../src/domain/timeAxis.ts";

afterEach(cleanup);

function hoursFromNow(count: number): string[] {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 3_600_000).toISOString());
}

describe("MobileTimeSlider", () => {
  it("shows NOW at index 0 and tints the chip live-green", () => {
    const { getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    const chip = getByTestId("time-slider-label");
    expect(chip.textContent).toContain("NOW");
    expect(chip.className).toContain("mobile-timeline-chip--now");
  });

  it("drops the live-green chip once the selection leaves NOW", () => {
    const { getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={5} onChange={() => {}} />,
    );
    expect(getByTestId("time-slider-label").className).not.toContain("mobile-timeline-chip--now");
  });

  it("renders one hour cell per hour", () => {
    const { getAllByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getAllByTestId("mobile-timeline-hour")).toHaveLength(73);
  });

  it("renders a divider per local calendar day plus a pinned day badge (at least 3 days across 73 hours)", () => {
    const { container, getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(container.querySelectorAll(".mobile-timeline-day-divider").length).toBeGreaterThanOrEqual(3);
    expect(getByTestId("time-slider-day-badge").textContent).toMatch(/^[A-Z]{3} \d{1,2}$/);
  });

  it("calls onChange when an hour cell is tapped", () => {
    const onChange = vi.fn();
    const { getAllByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={onChange} />,
    );
    fireEvent.click(getAllByTestId("mobile-timeline-hour")[5]);
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("keeps a keyboard/assistive range input backed by the same index", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={onChange} />,
    );
    const range = getByTestId("time-slider-range");
    expect(range.getAttribute("max")).toBe("72");
    fireEvent.change(range, { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("marks the selected hour and shows a NOW marker", () => {
    const { container, getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    const selected = container.querySelectorAll(".mobile-timeline-hour--selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("data-index")).toBe("0");
    expect(getByTestId("time-slider-now-marker")).toBeTruthy();
  });

  it("does not render a NOW marker when there's no hour data yet", () => {
    const { queryByTestId } = render(
      <MobileTimeSlider hours={[]} selectedIndex={0} onChange={() => {}} />,
    );
    expect(queryByTestId("time-slider-now-marker")).toBeNull();
  });

  it("renders today's elapsed hours as non-selectable past cells, so the day reads continuously", () => {
    vi.useFakeTimers();
    // 08:00Z = 10:00 Europe/Stockholm (CEST) - 10 elapsed hours today.
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    const hours = hoursFromNow(73);

    const { container, getAllByTestId, getByTestId } = render(
      <MobileTimeSlider hours={hours} selectedIndex={0} onChange={() => {}} />,
    );

    expect(container.querySelectorAll(".mobile-timeline-hour--past")).toHaveLength(10);
    // Only the 73 forecast hours are selectable.
    expect(getAllByTestId("mobile-timeline-hour")).toHaveLength(73);

    // The badge names today; the second day divider starts a full 24-hour
    // column after the first, i.e. after the 10 past cells + 14 hours to
    // midnight.
    expect(getByTestId("time-slider-day-badge").textContent).toBe("TUE 6");
    const dividers = container.querySelectorAll(".mobile-timeline-day-divider");
    expect((dividers[1] as HTMLElement).style.left).toBe(`${24 * MOBILE_HOUR_WIDTH_PX}px`);

    vi.useRealTimers();
  });
});
