import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";
import { WindRose, type RoseSector, type RoseState } from "../../src/components/WindRose/index.ts";

afterEach(cleanup);

const SW_SECTOR: RoseSector = { fromDeg: 213.75, toDeg: 236.25 };

function baseProps() {
  return {
    sector: SW_SECTOR,
    state: "green" as RoseState,
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
  };
}

describe("WindRose - sector rendering (per feedback: one wedge, colored by live status, not multiple green/orange wedges)", () => {
  it("renders exactly one sector wedge, filled by the current state's color", () => {
    const { container } = render(<WindRose {...baseProps()} state="orange" />);
    const wedges = container.querySelectorAll('[data-testid="sector"]');
    expect(wedges).toHaveLength(1);
    expect(wedges[0].getAttribute("fill")).toBe("#ff9800");
  });

  it.each<[RoseState, string]>([
    ["green", "#27c93f"],
    ["orange", "#ff9800"],
    ["red", "#f23535"],
    ["gray", "#757575"],
  ])("colors the wedge %s -> %s", (state, expectedFill) => {
    const { container } = render(<WindRose {...baseProps()} state={state} />);
    expect(container.querySelector('[data-testid="sector"]')?.getAttribute("fill")).toBe(expectedFill);
  });

  it("renders the wedge at less than full opacity so a map background shows through, matching the reference", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    const opacity = container.querySelector('[data-testid="sector"]')?.getAttribute("opacity");
    expect(Number(opacity)).toBeLessThan(1);
    expect(Number(opacity)).toBeGreaterThan(0);
  });

  it("renders no wedge when the site has no sector configured (never fabricate a range)", () => {
    const { container } = render(<WindRose {...baseProps()} sector={null} />);
    expect(container.querySelector('[data-testid="sector"]')).toBeNull();
  });

  it("keeps the sector path fixed when only the wind direction changes", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} windDirectionDeg={90} />);
    const before = container.querySelector('[data-testid="sector"]')?.getAttribute("d");

    rerender(<WindRose {...baseProps()} windDirectionDeg={270} />);
    const after = container.querySelector('[data-testid="sector"]')?.getAttribute("d");

    expect(after).toBe(before);
  });

  it("does not render a solid backdrop disc behind the wedge (reference is fully transparent otherwise)", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    expect(container.querySelector('[data-testid="sector-base"]')).toBeNull();
  });
});

describe("WindRose - wind pointer (§29.7)", () => {
  it("rotates the pointer when wind direction changes", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} windDirectionDeg={90} />);
    const pointsAt90 = container.querySelector('[data-testid="wind-pointer"]')?.getAttribute("points");

    rerender(<WindRose {...baseProps()} windDirectionDeg={270} />);
    const pointsAt270 = container.querySelector('[data-testid="wind-pointer"]')?.getAttribute("points");

    expect(pointsAt270).not.toBe(pointsAt90);
  });

  it("renders no pointer when wind direction is unknown", () => {
    const { container } = render(<WindRose {...baseProps()} windDirectionDeg={null} />);
    expect(container.querySelector('[data-testid="wind-pointer"]')).toBeNull();
  });
});

describe("WindRose - center speed (§29.8)", () => {
  it("updates the displayed speed", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} windSpeedMs={5.2} />);
    expect(container.querySelector('[data-testid="speed-text"]')?.textContent).toBe("5.2");

    rerender(<WindRose {...baseProps()} windSpeedMs={3.1} />);
    expect(container.querySelector('[data-testid="speed-text"]')?.textContent).toBe("3.1");
  });

  it("shows a placeholder when speed is unknown", () => {
    const { container } = render(<WindRose {...baseProps()} windSpeedMs={null} />);
    expect(container.querySelector('[data-testid="speed-text"]')?.textContent).toBe("–");
  });
});

describe("WindRose - history dots (§29.9)", () => {
  it("renders no dots when no history is supplied (forecast values must never fake history)", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    expect(container.querySelectorAll('[data-testid="history-dot"]')).toHaveLength(0);
  });

  it("renders one dot per supplied observation history point", () => {
    const { container } = render(
      <WindRose
        {...baseProps()}
        historyPoints={[
          { directionDeg: 220, recencyRank: 0 },
          { directionDeg: 210, recencyRank: 1 },
          { directionDeg: 230, recencyRank: 2 },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="history-dot"]')).toHaveLength(3);
  });
});

describe("WindRose - outer ring (per the reference HTML's own rendering: plain black outline, not a status indicator)", () => {
  it("always renders a plain black ring, independent of sector/wind data", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    const ring = container.querySelector('[data-testid="outer-ring"]');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute("stroke")).toBe("#111");
  });

  it("stays the same color across every state - status is read from the wedge, not the ring", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} state="red" />);
    const redRingColor = container.querySelector('[data-testid="outer-ring"]')?.getAttribute("stroke");

    rerender(<WindRose {...baseProps()} state="green" />);
    const greenRingColor = container.querySelector('[data-testid="outer-ring"]')?.getAttribute("stroke");

    expect(redRingColor).toBe(greenRingColor);
  });

  it("never adds a dasharray", () => {
    const { container } = render(<WindRose {...baseProps()} state="red" />);
    const ring = container.querySelector('[data-testid="outer-ring"]');
    expect(ring?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("is thin relative to the rose's radius, matching the reference's proportions (not the earlier too-thick pass)", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    const width = Number(container.querySelector('[data-testid="outer-ring"]')?.getAttribute("stroke-width"));
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(3);
  });
});

describe("WindRose - weather icon background (per follow-up feedback: transparent, so the sector color shows through)", () => {
  it("renders no opaque backing patch behind the icon/speed text", () => {
    const { container } = render(<WindRose {...baseProps()} weatherKind="rain" />);
    expect(container.querySelector('[data-testid="text-legibility-bg"]')).toBeNull();
  });
});

describe("WindRose - north reference (per user's uploaded sector-rose design)", () => {
  it("always renders a fixed north tick and label, independent of sector/wind data", () => {
    const { container } = render(<WindRose {...baseProps()} windDirectionDeg={null} windSpeedMs={null} />);
    expect(container.querySelector('[data-testid="north-tick"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="north-label"]')?.textContent).toBe("N");
  });
});

describe("WindRose - embedded weather icon (per user's uploaded sector-rose design: icon moved inside the rose)", () => {
  it("renders the weather icon inside the rose when a kind is supplied", () => {
    const { container } = render(<WindRose {...baseProps()} weatherKind="rain" />);
    const iconGroup = container.querySelector('[data-testid="rose-weather-icon"]');
    expect(iconGroup).not.toBeNull();
    // nested inside the rose's own <svg>, not a sibling element - confirms the icon lives INSIDE the rose now
    expect(container.querySelector("svg svg")).not.toBeNull();
  });

  it("renders no icon when no weather kind is supplied (never fabricate weather data)", () => {
    const { container } = render(<WindRose {...baseProps()} />);
    expect(container.querySelector('[data-testid="rose-weather-icon"]')).toBeNull();
  });
});

describe("WindRose - size handling (§29.11, §29.12)", () => {
  it.each([48, 64])("renders at %ipx", (size) => {
    const { container } = render(<WindRose {...baseProps()} size={size} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe(String(size));
    expect(svg?.getAttribute("height")).toBe(String(size));
  });

  it("uses identical angle semantics regardless of display size (marker vs expanded view)", () => {
    const small = render(<WindRose {...baseProps()} size={64} />);
    const large = render(<WindRose {...baseProps()} size={160} />);

    const smallSectorD = small.container.querySelector('[data-testid="sector"]')?.getAttribute("d");
    const largeSectorD = large.container.querySelector('[data-testid="sector"]')?.getAttribute("d");
    expect(smallSectorD).toBe(largeSectorD);

    const smallPointer = small.container.querySelector('[data-testid="wind-pointer"]');
    const largePointer = large.container.querySelector('[data-testid="wind-pointer"]');
    expect(smallPointer?.getAttribute("points")).toBe(largePointer?.getAttribute("points"));

    const smallSvg = small.container.querySelector("svg");
    const largeSvg = large.container.querySelector("svg");
    expect(smallSvg?.getAttribute("width")).toBe("64");
    expect(largeSvg?.getAttribute("width")).toBe("160");

    small.unmount();
    large.unmount();
  });
});
