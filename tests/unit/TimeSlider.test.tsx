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
});
