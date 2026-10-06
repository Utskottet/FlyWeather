import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MobileTimeSlider } from "../../src/components/TimeSlider/MobileTimeSlider.tsx";

afterEach(cleanup);

function hoursFromNow(count: number): string[] {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 3_600_000).toISOString());
}

describe("MobileTimeSlider", () => {
  it("shows NOW at index 0", () => {
    const { getByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getByTestId("time-slider-label").textContent).toContain("NOW");
  });

  it("renders one hour cell per hour", () => {
    const { getAllByTestId } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    expect(getAllByTestId("mobile-timeline-hour")).toHaveLength(73);
  });

  it("renders one day column header per local calendar day (at least 3 across 73 hours)", () => {
    const { container } = render(
      <MobileTimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={() => {}} />,
    );
    const dayHeaders = container.querySelectorAll(".mobile-timeline-day");
    expect(dayHeaders.length).toBeGreaterThanOrEqual(3);
    for (const header of dayHeaders) {
      expect(header.textContent).toMatch(/^[A-Z]{3} \d{1,2}$/);
    }
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
});
