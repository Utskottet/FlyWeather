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
    country: "se",
    region: "skane",
    group: "ridge",
    coordinates: { lat: 55.4, lon: 14.0, verified: true },
    sector: { ranges: [{ from_deg: 200, to_deg: 250 }], verified: false },
    wind: { verified: false },
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

describe("SiteSheet - height display (§ FlyWeather Interaction Model altitude slider)", () => {
  it("shows the effective height directly at Surface (10m)", () => {
    const { getByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        effectiveHeightM={10}
        heightSupported={true}
        isNight={false}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toBe("10 m AGL");
  });

  it("shows the effective height directly for any altitude above Surface", () => {
    const { getByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        effectiveHeightM={150}
        heightSupported={true}
        isNight={false}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toBe("150 m AGL");
  });

  it("shows a clamped effective height honestly (e.g. 180m real ceiling for a 1200m request) rather than fabricating the requested value", () => {
    const { getByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        effectiveHeightM={180}
        heightSupported={true}
        isNight={false}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toBe("180 m AGL");
  });

  it("shows unsupported, not a silent fallback, when there is no valid wind-aloft data for this hour", () => {
    const { getByTestId, queryByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={{ ...baseSample, windDirectionDeg: null, windSpeedMs: null }}
        effectiveHeightM={null}
        heightSupported={false}
        isNight={false}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("site-sheet-height").textContent).toBe("unsupported");
    expect(queryByTestId("site-sheet-height-warning")).not.toBeNull();
  });

  it("does not show the unsupported warning when height is supported", () => {
    const { queryByTestId } = render(
      <SiteSheet
        site={locatedSite()}
        sample={baseSample}
        effectiveHeightM={150}
        heightSupported={true}
        isNight={false}
        onClose={() => {}}
      />,
    );
    expect(queryByTestId("site-sheet-height-warning")).toBeNull();
  });
});

describe("SiteSheet - parking", () => {
  function renderSheet(site: LocatedSite) {
    return render(
      <SiteSheet
        site={site}
        sample={baseSample}
        effectiveHeightM={10}
        heightSupported={true}
        isNight={false}
        onClose={() => {}}
      />,
    );
  }

  it("offers navigation when a site has a parking spot", () => {
    const { getByTestId } = renderSheet(locatedSite({ parking: { lat: 55.41102, lon: 13.99515 } }));
    const link = getByTestId("site-sheet-parking");
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=55.41102,13.99515");
    // Opened in a new tab, and without handing the destination to the
    // referrer of whatever the visitor clicks next.
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("says nothing at all when a site has no parking", () => {
    const { queryByTestId } = renderSheet(locatedSite());
    expect(queryByTestId("site-sheet-parking")).toBeNull();
  });

  it("shows the note, which is where the access condition lives", () => {
    const { getByTestId } = renderSheet(
      locatedSite({ parking: { lat: 55.41102, lon: 13.99515, note: "Fråga i klubben först" } }),
    );
    expect(getByTestId("site-sheet-parking-note").textContent).toBe("Fråga i klubben först");
  });

  it("puts the button BELOW the site's warnings", () => {
    // Several of these sites exist on a landowner's goodwill. "Private
    // field, contact the club" has to be read before a button that
    // drives you there - a navigate button above the restriction would
    // be the app quietly overruling it.
    const { getByTestId, container } = renderSheet(
      locatedSite({
        warnings: ["Privat mark - kontakta klubben"],
        parking: { lat: 55.41102, lon: 13.99515 },
      }),
    );
    const warnings = container.querySelector(".site-sheet-restrictions")!;
    const parking = getByTestId("site-sheet-parking");
    // Node.DOCUMENT_POSITION_FOLLOWING: parking comes after the warnings.
    expect(warnings.compareDocumentPosition(parking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
