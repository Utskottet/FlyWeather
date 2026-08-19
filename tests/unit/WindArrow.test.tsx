import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WindArrow } from "../../src/components/WindArrowField/index.ts";

afterEach(cleanup);

/** Pulls every numeric x,y pair out of the path's `d` attribute, in order: [tip, shoulderRight, taperRight, bellyRight(control), tailTip, bellyLeft(control), taperLeft, shoulderLeft]. */
function pathPoints(d: string): { x: number; y: number }[] {
  const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

describe("WindArrow (§9 regional wind field)", () => {
  it("points downwind (opposite of source direction), unlike WindRose's source-pointing arrow", () => {
    // wind FROM west (270deg) blows TOWARD east (90deg) - the tip
    // (first point in the path) should sit to the east (x > center) and
    // the tail tip (5th point) to the west (x < center).
    const { container } = render(<WindArrow windDirectionDeg={270} windSpeedMs={5} size={100} />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    const points = pathPoints(d);
    expect(points[0].x).toBeGreaterThan(50); // tip, east of center
    expect(points[4].x).toBeLessThan(50); // tail tip, west of center
  });

  it("scales color by speed band", () => {
    const calm = render(<WindArrow windDirectionDeg={0} windSpeedMs={1} />);
    const strong = render(<WindArrow windDirectionDeg={0} windSpeedMs={15} />);
    const calmColor = calm.container.querySelector("path")?.getAttribute("fill");
    const strongColor = strong.container.querySelector("path")?.getAttribute("fill");
    expect(calmColor).not.toBe(strongColor);
    calm.unmount();
    strong.unmount();
  });

  it("renders a longer (but capped) shaft for stronger wind", () => {
    function shaftLength(container: HTMLElement) {
      const d = container.querySelector("path")!.getAttribute("d")!;
      const points = pathPoints(d);
      const tip = points[0];
      const tailTip = points[4];
      return Math.hypot(tip.x - tailTip.x, tip.y - tailTip.y);
    }

    const light = render(<WindArrow windDirectionDeg={0} windSpeedMs={1} size={100} />);
    const strong = render(<WindArrow windDirectionDeg={0} windSpeedMs={10} size={100} />);
    const veryStrong = render(<WindArrow windDirectionDeg={0} windSpeedMs={40} size={100} />);

    const lightLen = shaftLength(light.container);
    const strongLen = shaftLength(strong.container);
    const veryStrongLen = shaftLength(veryStrong.container);

    expect(strongLen).toBeGreaterThan(lightLen);
    expect(veryStrongLen).toBeLessThanOrEqual(100 * 0.46 * 2 + 0.01); // capped, not unbounded

    light.unmount();
    strong.unmount();
    veryStrong.unmount();
  });

  it("keeps the arrowhead narrower than the shoulder step (distinct head, not a smooth taper)", () => {
    const { container } = render(<WindArrow windDirectionDeg={0} windSpeedMs={5} size={100} />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    const points = pathPoints(d);
    const [tip, shoulderRight, taperRight] = points;
    const shoulderDist = Math.hypot(shoulderRight.x - tip.x, shoulderRight.y - tip.y);
    const taperDist = Math.hypot(taperRight.x - 50, taperRight.y - 50);
    // the shoulder (head's base) sits farther from center-axis than the
    // tail-side taper point at the same along-distance - that gap is
    // the visible "step" that makes the head read as its own shape.
    expect(shoulderDist).toBeGreaterThan(0);
    expect(taperDist).toBeGreaterThan(0);
    expect(Math.hypot(shoulderRight.x - 50, shoulderRight.y - 50)).toBeGreaterThan(taperDist);
  });

  it("renders at the requested size", () => {
    const { container } = render(<WindArrow windDirectionDeg={90} windSpeedMs={3} size={40} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("40");
  });
});
