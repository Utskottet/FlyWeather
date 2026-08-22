import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RaspControl } from "../../src/components/RaspControl/RaspControl.tsx";

afterEach(cleanup);

describe("RaspControl (§ FlyWeather GUI Reorganization + Coherent Height Wind item 6)", () => {
  it("hides the parameter submenu entirely while RASP is off - never permanently spread across the UI", () => {
    const { queryByTestId } = render(
      <RaspControl show={false} onChange={() => {}} selectedParam="wstar" onParamChange={() => {}} availableParams={["wstar"]} />,
    );
    expect(queryByTestId("rasp-param-popover")).toBeNull();
  });

  it("shows the parameter submenu the moment RASP is on - one tap does both", () => {
    const { getByTestId } = render(
      <RaspControl
        show={true}
        onChange={() => {}}
        selectedParam="wstar"
        onParamChange={() => {}}
        availableParams={["wstar", "thermal_top", "hcrit", "cloudbase"]}
      />,
    );
    expect(getByTestId("rasp-param-popover")).toBeTruthy();
    expect(getByTestId("rasp-param-selector")).toBeTruthy();
  });

  it("toggling the RASP button calls onChange, independent of the submenu", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <RaspControl show={false} onChange={onChange} selectedParam="wstar" onParamChange={() => {}} availableParams={["wstar"]} />,
    );
    fireEvent.click(getByTestId("rasp-toggle"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("forwards parameter selection to onParamChange", () => {
    const onParamChange = vi.fn();
    const { getByTestId } = render(
      <RaspControl
        show={true}
        onChange={() => {}}
        selectedParam="wstar"
        onParamChange={onParamChange}
        availableParams={["wstar", "thermal_top"]}
      />,
    );
    fireEvent.click(getByTestId("rasp-param-thermal_top"));
    expect(onParamChange).toHaveBeenCalledWith("thermal_top");
  });
});
