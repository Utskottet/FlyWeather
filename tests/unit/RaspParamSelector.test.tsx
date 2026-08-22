import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RaspParamSelector } from "../../src/components/RaspParamSelector/RaspParamSelector.tsx";

afterEach(cleanup);

describe("RaspParamSelector", () => {
  it("renders all four parameter buttons", () => {
    const { getByTestId } = render(<RaspParamSelector selected="wstar" onChange={() => {}} />);
    expect(getByTestId("rasp-param-wstar")).toBeTruthy();
    expect(getByTestId("rasp-param-thermal_top")).toBeTruthy();
    expect(getByTestId("rasp-param-hcrit")).toBeTruthy();
    expect(getByTestId("rasp-param-cloudbase")).toBeTruthy();
  });

  it("marks the selected key active and no others", () => {
    const { getByTestId } = render(<RaspParamSelector selected="hcrit" onChange={() => {}} />);
    expect(getByTestId("rasp-param-hcrit").className).toContain("active");
    expect(getByTestId("rasp-param-wstar").className).not.toContain("active");
  });

  it("calls onChange with the clicked key", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<RaspParamSelector selected="wstar" onChange={onChange} />);
    fireEvent.click(getByTestId("rasp-param-cloudbase"));
    expect(onChange).toHaveBeenCalledWith("cloudbase");
  });

  it("disables keys not in availableParams, never silently hides them", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <RaspParamSelector selected="wstar" onChange={onChange} availableParams={["wstar"]} />,
    );
    const hcritButton = getByTestId("rasp-param-hcrit") as HTMLButtonElement;
    expect(hcritButton.disabled).toBe(true);
    fireEvent.click(hcritButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses plain non-jargon labels, with no technical shorthand visible", () => {
    const { getByTestId } = render(<RaspParamSelector selected="wstar" onChange={() => {}} />);
    expect(getByTestId("rasp-param-wstar").textContent).toBe("Thermals");
    expect(getByTestId("rasp-param-hcrit").textContent).toBe("Usable height");
  });
});
