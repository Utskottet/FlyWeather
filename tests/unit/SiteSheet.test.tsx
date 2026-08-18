import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SiteSheet } from "../../src/components/SiteSheet/SiteSheet.tsx";
import type { LocatedSite } from "../../src/domain/sites.ts";

afterEach(cleanup);

function locatedSite(overrides: Partial<LocatedSite> = {}): LocatedSite {
  return {
    id: "test-site",
    enabled: true,
    name: "Test Site",
    country: "SE",
    type: "hang",
    coordinates: { lat: 55.4, lon: 14.0, verified: true },
    rose: { verified: false, green: [{ from_deg: 200, to_deg: 250 }], orange: [] },
    wind_speed: { verified: false },
    soaring_height: { agl_m: null, verified: false },
    live_sources: [],
    description: "A test site.",
    ...overrides,
  } as LocatedSite;
}

const baseSample = {
  windDirectionDeg: 225,
  windSpeedMs: 5,
  windGustMs: null,
  weatherKind: "clear" as const,
  sourceKind: "forecast" as const,
  sourceId: "open-meteo",
  freshness: null,
  ageMinutes: null,
};

describe("SiteSheet - height mode (§7, Block 7 DoD)", () => {
  it("shows the effective height in Surface mode", () => {
    const { getByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        heightMode="surface"
        effectiveHeightM={10}
        heightSupported={true}
        selectedTimestamp={null}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toContain("Surface");
    expect(getByTestId("site-sheet-height").textContent).toContain("10 m AGL");
  });

  it("shows unsupported, not a silent surface fallback, when soaring height isn't configured", () => {
    const { getByTestId, queryByTestId } = render(
      <SiteSheet
        site={locatedSite({ soaring_height: { agl_m: null, verified: false } })}
        sample={{ ...baseSample, windDirectionDeg: null, windSpeedMs: null }}
        heightMode="soaring"
        effectiveHeightM={null}
        heightSupported={false}
        selectedTimestamp={null}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toContain("unsupported");
    expect(queryByTestId("site-sheet-height-warning")).not.toBeNull();
  });

  it("does not show the unsupported warning when height is supported", () => {
    const { queryByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        heightMode="soaring"
        effectiveHeightM={150}
        heightSupported={true}
        selectedTimestamp={null}
        onClose={() => {}}
      />,
    );
    expect(queryByTestId("site-sheet-height-warning")).toBeNull();
  });
});
