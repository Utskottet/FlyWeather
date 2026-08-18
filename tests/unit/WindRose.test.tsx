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

describe("WindRose - wind arrow (§29.7)", () => {
  it("rotates the arrow when wind direction changes", () => {
    const { container, rerender } = render(<WindRose {...baseProps()} windDirectionDeg={90} />);
    const line1 = container.querySelector('[data-testid="wind-arrow-line"]');
    const x2At90 = line1?.getAttribute("x2");
    const y2At90 = line1?.getAttribute("y2");

    rerender(<WindRose {...baseProps()} windDirectionDeg={270} />);
    const line2 = container.querySelector('[data-testid="wind-arrow-line"]');

    expect(line2?.getAttribute("x2")).not.toBe(x2At90);
    expect(line2?.getAttribute("y2")).not.toBe(y2At90);
  });

  it("renders no arrow when wind direction is unknown", () => {
    const { container } = render(<WindRose {...baseProps()} windDirectionDeg={null} />);
    expect(container.querySelector('[data-testid="wind-arrow"]')).toBeNull();
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

    const smallArrow = small.container.querySelector('[data-testid="wind-arrow-line"]');
    const largeArrow = large.container.querySelector('[data-testid="wind-arrow-line"]');
    expect(smallArrow?.getAttribute("x2")).toBe(largeArrow?.getAttribute("x2"));
    expect(smallArrow?.getAttribute("y2")).toBe(largeArrow?.getAttribute("y2"));

    const smallSvg = small.container.querySelector("svg");
    const largeSvg = large.container.querySelector("svg");
    expect(smallSvg?.getAttribute("width")).toBe("64");
    expect(largeSvg?.getAttribute("width")).toBe("160");

    small.unmount();
    large.unmount();
  });
});
