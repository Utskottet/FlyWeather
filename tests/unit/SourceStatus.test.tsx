import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SourceStatus } from "../../src/components/SourceStatus/SourceStatus.tsx";

afterEach(cleanup);

describe("SourceStatus (§ FlyWeather GUI Reorganization + Coherent Height Wind items 15-18)", () => {
  it("shows SITES as MEASURED at START, and WIND FIELD as FORECAST even then - the field is always model data", () => {
    const { getByTestId, queryByTestId } = render(<SourceStatus sitesMeasured={true} raspOn={false} />);
    expect(getByTestId("source-status-sites").textContent).toContain("MEASURED");
    expect(getByTestId("source-status-wind").textContent).toContain("FORECAST");
    expect(queryByTestId("source-status-rasp")).toBeNull();
  });

  it("switches SITES to FORECAST once time/height has moved, without touching WIND FIELD's constant FORECAST label", () => {
    const { getByTestId } = render(<SourceStatus sitesMeasured={false} raspOn={false} />);
    expect(getByTestId("source-status-sites").textContent).toContain("FORECAST");
    expect(getByTestId("source-status-wind").textContent).toContain("FORECAST");
  });

  it("shows a RASP status chip only when RASP is on - never wastes space on it otherwise", () => {
    const { getByTestId } = render(<SourceStatus sitesMeasured={true} raspOn={true} />);
    expect(getByTestId("source-status-rasp").textContent).toContain("FORECAST");
  });

  it("never relies on color alone - MEASURED/FORECAST words are always present in the DOM text", () => {
    const { getByTestId } = render(<SourceStatus sitesMeasured={true} raspOn={true} />);
    for (const testId of ["source-status-sites", "source-status-wind", "source-status-rasp"]) {
      expect(getByTestId(testId).textContent).toMatch(/MEASURED|FORECAST/);
    }
  });
});
