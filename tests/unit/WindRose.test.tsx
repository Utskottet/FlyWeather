import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";
import { WindRose, type RoseSector, type RoseState } from "../../src/components/WindRose/index.ts";

afterEach(cleanup);

const SW_GREEN: RoseSector[] = [{ fromDeg: 213.75, toDeg: 236.25 }];
const SW_ORANGE: RoseSector[] = [
  { fromDeg: 202.5, toDeg: 213.75 },
  { fromDeg: 236.25, toDeg: 247.5 },
];

function baseProps() {
  return {
    greenSectors: SW_GREEN,
    orangeSectors: SW_ORANGE,
    windDirectionDeg: 225,
    windSpeedMs: 5.2,
    state: "green" as RoseState,
  };
}

describe("WindRose - sector rendering (§29.5, §29.6)", () => {
  it("renders multiple green sectors", () => {
    const { container } = render(
      <WindRose
        {...baseProps()}
        greenSectors={[
          { fromDeg: 60, toDeg: 90 },
          { fromDeg: 240, toDeg: 270 },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="green-sector"]')).toHaveLength(2);
  });

  it("keeps sector paths fixed when only the wind direction changes", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} windDirectionDeg={90} />);
    const before = Array.from(container.querySelectorAll('[data-testid="green-sector"]')).map((el) =>
      el.getAttribute("d"),
    );

    rerender(<WindRose {...baseProps()} windDirectionDeg={270} />);
    const after = Array.from(container.querySelectorAll('[data-testid="green-sector"]')).map((el) =>
      el.getAttribute("d"),
    );

    expect(after).toEqual(before);
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

describe("WindRose - overall state styling (§29.10)", () => {
  it.each<RoseState>(["green", "orange", "red", "gray"])(
    "keeps sector geometry visible under %s overall state",
    (state) => {
      const { container } = render(<WindRose {...baseProps()} state={state} />);
      expect(container.querySelectorAll('[data-testid="green-sector"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="orange-sector"]')).toHaveLength(2);
      expect(container.querySelector('[data-testid="state-ring"]')).not.toBeNull();
    },
  );

  it("gives the red state a dashed ring, not just a hue (§28 - colorblind-safe cue)", () => {
    const { container } = render(<WindRose {...baseProps()} state="red" />);
    const ring = container.querySelector('[data-testid="state-ring"]');
    expect(ring?.getAttribute("stroke-dasharray")).not.toBeNull();
  });

  it.each<RoseState>(["green", "orange", "gray"])("keeps a solid ring for %s (only red is dashed)", (state) => {
    const { container } = render(<WindRose {...baseProps()} state={state} />);
    const ring = container.querySelector('[data-testid="state-ring"]');
    expect(ring?.getAttribute("stroke-dasharray")).toBeNull();
  });
});

describe("WindRose - north reference (per user's uploaded sector-rose design)", () => {
  it("always renders a fixed north tick and label, independent of sector/wind data", () => {
    const { container } = render(<WindRose {...baseProps()} windDirectionDeg={null} windSpeedMs={null} />);
    expect(container.querySelector('[data-testid="north-tick"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="north-label"]')?.textContent).toBe("N");
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

    const smallSectorD = small.container.querySelector('[data-testid="green-sector"]')?.getAttribute("d");
    const largeSectorD = large.container.querySelector('[data-testid="green-sector"]')?.getAttribute("d");
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
