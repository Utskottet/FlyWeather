import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MobileHeightControl } from "../../src/components/AltitudeControl/MobileHeightControl.tsx";

afterEach(cleanup);

describe("MobileHeightControl", () => {
  it("shows the current value on the button and keeps the slider closed", () => {
    const { getByTestId, queryByTestId } = render(<MobileHeightControl altitudeM={0} onChange={() => {}} />);
    expect(getByTestId("mobile-height-value").textContent).toBe("Surface");
    expect(queryByTestId("altitude-slider-range")).toBeNull();
  });

  it("shows the chosen height when above surface", () => {
    const { getByTestId } = render(<MobileHeightControl altitudeM={70} onChange={() => {}} />);
    expect(getByTestId("mobile-height-value").textContent).toContain("70");
  });

  it("opens the slider on tap and reports a change", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<MobileHeightControl altitudeM={0} onChange={onChange} />);
    fireEvent.click(getByTestId("mobile-height-button"));
    fireEvent.change(getByTestId("altitude-slider-range"), { target: { value: "0.5" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it("closes on Escape without changing the value", () => {
    const onChange = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <MobileHeightControl altitudeM={0} onChange={onChange} />,
    );
    fireEvent.click(getByTestId("mobile-height-button"));
    expect(queryByTestId("altitude-slider-range")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByTestId("altitude-slider-range")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
