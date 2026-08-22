import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ParameterLegend } from "../../src/components/ParameterLegend/ParameterLegend.tsx";
import type { SoaringColorStop } from "../../src/domain/soaring.ts";

afterEach(cleanup);

const WSTAR_STOPS: SoaringColorStop[] = [
  { value: 0.0, color: "#c8c8c8" },
  { value: 0.5, color: "#4a90d9" },
  { value: 1.0, color: "#4ac9c0" },
  { value: 3.5, color: "#d9342b" },
];

describe("ParameterLegend", () => {
  it("shows the real numeric value of every color stop as visible text - the whole point", () => {
    const { getByTestId } = render(
      <ParameterLegend label="Thermal strength" technicalLabel="W*" unit="m/s" colorScale={WSTAR_STOPS} />,
    );
    const ticks = getByTestId("rasp-legend-ticks");
    // A pilot unfamiliar with the code must be able to read a value off
    // the legend - never just "bad/okay/great".
    expect(ticks.textContent).toContain("0");
    expect(ticks.textContent).toContain("0.5");
    expect(ticks.textContent).toContain("1");
    expect(ticks.textContent).toContain("3.5");
  });

  it("titles with the exact three-segment format the task mandates: label · technicalLabel · unit", () => {
    const { getByTestId } = render(
      <ParameterLegend label="Thermal strength" technicalLabel="W*" unit="m/s" colorScale={WSTAR_STOPS} />,
    );
    expect(getByTestId("rasp-legend").querySelector(".rasp-legend-title")?.textContent?.trim()).toBe(
      "Thermal strength · W* · m/s",
    );
  });

  it("shows the unit explicitly in the title", () => {
    const { getByTestId } = render(
      <ParameterLegend label="Thermal strength" technicalLabel="W*" unit="m/s" colorScale={WSTAR_STOPS} />,
    );
    expect(getByTestId("rasp-legend").textContent).toContain("m/s");
  });

  it("positions ticks proportionally to their real value, not evenly by index", () => {
    // Stops are 0, 0.5, 1.0, 3.5 - deliberately uneven at the end, so an
    // index-based (evenly-spaced) legend would misrepresent the mapping.
    const { container } = render(
      <ParameterLegend label="Thermal strength" technicalLabel="W*" unit="m/s" colorScale={WSTAR_STOPS} />,
    );
    const ticks = Array.from(container.querySelectorAll(".rasp-legend-tick")) as HTMLElement[];
    const leftOf = (text: string) => Number(ticks.find((t) => t.textContent === text)!.style.left.replace("%", ""));
    expect(leftOf("0")).toBe(0);
    expect(leftOf("3.5")).toBe(100);
    // 1.0 is 1/3.5 of the way from 0 to 3.5 - should sit well before the
    // midpoint, not at an evenly-spaced 50%/33% index position.
    expect(leftOf("1")).toBeCloseTo((1 / 3.5) * 100, 1);
  });

  it("shows provenance text when supplied", () => {
    const { getByTestId } = render(
      <ParameterLegend
        label="Cloudbase"
        technicalLabel="LCL"
        unit="m"
        colorScale={WSTAR_STOPS}
        provenance="DMI HARMONIE · model run 2026-08-22 06:00Z"
      />,
    );
    expect(getByTestId("rasp-legend").textContent).toContain("model run 2026-08-22 06:00Z");
  });

  it("renders nothing for an empty color scale rather than crashing", () => {
    const { container } = render(<ParameterLegend label="X" technicalLabel="X" unit="m" colorScale={[]} />);
    expect(container.querySelector("[data-testid='rasp-legend']")).toBeNull();
  });
});
