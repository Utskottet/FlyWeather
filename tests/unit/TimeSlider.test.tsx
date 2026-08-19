import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TimeSlider } from "../../src/components/TimeSlider/TimeSlider.tsx";

afterEach(cleanup);

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
    expect((getByTestId("time-slider-now-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onChange with the new index when the range input moves", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={0} onChange={onChange} />,
    );
    fireEvent.change(getByTestId("time-slider-range"), { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("jumps back to index 0 when the NOW button is clicked", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TimeSlider hours={hoursFromNow(73)} selectedIndex={10} onChange={onChange} />,
    );
    fireEvent.click(getByTestId("time-slider-now-button"));
    expect(onChange).toHaveBeenCalledWith(0);
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
