import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PressToggle } from "../../src/components/PressToggle/PressToggle.tsx";

afterEach(cleanup);

describe("PressToggle (§ FlyWeather Next UI single-label toggle)", () => {
  it("never changes its label text between pressed and unpressed states", () => {
    const { getByTestId, rerender } = render(
      <PressToggle label="Wind" pressed={false} onChange={() => {}} testId="wind" />,
    );
    expect(getByTestId("wind").textContent).toBe("Wind");
    rerender(<PressToggle label="Wind" pressed={true} onChange={() => {}} testId="wind" />);
    expect(getByTestId("wind").textContent).toBe("Wind");
  });

  it("reflects state via aria-pressed, not text", () => {
    const { getByTestId, rerender } = render(
      <PressToggle label="RASP" pressed={false} onChange={() => {}} testId="rasp" />,
    );
    expect(getByTestId("rasp").getAttribute("aria-pressed")).toBe("false");
    rerender(<PressToggle label="RASP" pressed={true} onChange={() => {}} testId="rasp" />);
    expect(getByTestId("rasp").getAttribute("aria-pressed")).toBe("true");
  });

  it("applies the active class only when pressed", () => {
    const { getByTestId, rerender } = render(
      <PressToggle label="Airspace" pressed={false} onChange={() => {}} testId="airspace" />,
    );
    expect(getByTestId("airspace").className).not.toMatch(/active/);
    rerender(<PressToggle label="Airspace" pressed={true} onChange={() => {}} testId="airspace" />);
    expect(getByTestId("airspace").className).toMatch(/active/);
  });

  it("calls onChange with the inverted state on click", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<PressToggle label="Wind" pressed={true} onChange={onChange} testId="wind" />);
    fireEvent.click(getByTestId("wind"));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
