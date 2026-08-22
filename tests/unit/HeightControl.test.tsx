import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HeightControl } from "../../src/components/HeightControl/HeightControl.tsx";

afterEach(cleanup);

describe("HeightControl (§ FlyWeather GUI Reorganization + Coherent Height Wind item 7)", () => {
  it("shows a plain HEIGHT label at Surface, and the collapsed slider by default", () => {
    const { getByTestId, queryByTestId } = render(<HeightControl altitudeM={0} onChange={() => {}} />);
    expect(getByTestId("height-control-button").textContent).toContain("HEIGHT");
    expect(queryByTestId("height-control-slider")).toBeNull();
  });

  it("discloses the active altitude in the button label above Surface, without expanding", () => {
    const { getByTestId, queryByTestId } = render(<HeightControl altitudeM={70} onChange={() => {}} />);
    expect(getByTestId("height-control-button").textContent).toContain("70");
    expect(queryByTestId("height-control-slider")).toBeNull();
  });

  it("reveals the slider on tap and collapses it again on a second tap, never resetting the altitude", () => {
    const onChange = vi.fn();
    const { getByTestId, queryByTestId } = render(<HeightControl altitudeM={70} onChange={onChange} />);
    fireEvent.click(getByTestId("height-control-button"));
    expect(getByTestId("height-control-slider")).toBeTruthy();
    expect(getByTestId("altitude-slider-label").textContent).toBe("70 m AGL");

    fireEvent.click(getByTestId("height-control-button"));
    expect(queryByTestId("height-control-slider")).toBeNull();
    expect(onChange).not.toHaveBeenCalled(); // collapsing is a pure UI action, never touches altitude
  });

  it("forwards slider changes to onChange while expanded", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<HeightControl altitudeM={0} onChange={onChange} />);
    fireEvent.click(getByTestId("height-control-button"));
    fireEvent.change(getByTestId("altitude-slider-range"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith(180);
  });
});
