import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WindArrow } from "../../src/components/WindArrowField/index.ts";

afterEach(cleanup);

describe("WindArrow (§9 regional wind field)", () => {
  it("points downwind (opposite of source direction), unlike WindRose's source-pointing arrow", () => {
    // wind FROM west (270deg) blows TOWARD east (90deg) - the arrow tip
    // should sit to the east (x > center) of the tail (x < center).
    const { container } = render(<WindArrow windDirectionDeg={270} windSpeedMs={5} size={100} />);
    const line = container.querySelector("line");
    const x1 = Number(line?.getAttribute("x1"));
    const x2 = Number(line?.getAttribute("x2"));
    expect(x2).toBeGreaterThan(x1);
  });

  it("scales color by speed band", () => {
    const calm = render(<WindArrow windDirectionDeg={0} windSpeedMs={1} />);
    const strong = render(<WindArrow windDirectionDeg={0} windSpeedMs={15} />);
    const calmColor = calm.container.querySelector("line")?.getAttribute("stroke");
    const strongColor = strong.container.querySelector("line")?.getAttribute("stroke");
    expect(calmColor).not.toBe(strongColor);
    calm.unmount();
    strong.unmount();
  });

  it("renders longer (but capped) shafts for stronger wind", () => {
    const light = render(<WindArrow windDirectionDeg={0} windSpeedMs={1} size={100} />);
    const strong = render(<WindArrow windDirectionDeg={0} windSpeedMs={10} size={100} />);
    const veryStrong = render(<WindArrow windDirectionDeg={0} windSpeedMs={40} size={100} />);

    function shaftLength(container: HTMLElement) {
      const line = container.querySelector("line")!;
      const dx = Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"));
      const dy = Number(line.getAttribute("y2")) - Number(line.getAttribute("y1"));
      return Math.hypot(dx, dy);
    }

    const lightLen = shaftLength(light.container);
    const strongLen = shaftLength(strong.container);
    const veryStrongLen = shaftLength(veryStrong.container);

    expect(strongLen).toBeGreaterThan(lightLen);
    expect(veryStrongLen).toBeLessThanOrEqual(100 * 0.44 * 2 + 0.01); // capped, not unbounded

    light.unmount();
    strong.unmount();
    veryStrong.unmount();
  });

  it("renders at the requested size", () => {
    const { container } = render(<WindArrow windDirectionDeg={90} windSpeedMs={3} size={40} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("40");
  });
});
