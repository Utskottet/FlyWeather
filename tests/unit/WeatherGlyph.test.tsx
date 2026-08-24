import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WeatherGlyph } from "../../src/components/WeatherGlyph/index.ts";
import type { WeatherKind } from "../../src/domain/weather.ts";

afterEach(cleanup);

const ALL_KINDS: WeatherKind[] = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "showers",
  "thunder",
  "snow",
  "unknown",
];

describe("WeatherGlyph", () => {
  it.each(ALL_KINDS)("renders an svg with an accessible label for %s", (kind) => {
    const { container } = render(<WeatherGlyph kind={kind} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toBe(`Weather: ${kind}`);
  });

  it("scales to the requested size", () => {
    const { container } = render(<WeatherGlyph kind="clear" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it.each(["clear", "partly-cloudy"] as const)("swaps the Sun for a Moon path at night for %s, and flags it in the label", (kind) => {
    const day = render(<WeatherGlyph kind={kind} isNight={false} />);
    const daySvg = day.container.querySelector("svg")!;
    expect(daySvg.getAttribute("aria-label")).toBe(`Weather: ${kind}`);
    // Sun renders <circle>/<line> rays; Moon renders a single filled <path>.
    expect(daySvg.querySelector("circle")).not.toBeNull();
    day.unmount();

    const night = render(<WeatherGlyph kind={kind} isNight={true} />);
    const nightSvg = night.container.querySelector("svg")!;
    expect(nightSvg.getAttribute("aria-label")).toBe(`Weather: ${kind}, night`);
    expect(nightSvg.querySelector("circle")).toBeNull();
    expect(nightSvg.querySelector("path")).not.toBeNull();
  });

  it.each(["cloudy", "rain", "snow", "unknown"] as const)("isNight has no visible effect on %s - only clear/partly-cloudy ever render a Sun", (kind) => {
    const day = render(<WeatherGlyph kind={kind} isNight={false} />);
    const dayHtml = day.container.innerHTML;
    day.unmount();
    const night = render(<WeatherGlyph kind={kind} isNight={true} />);
    expect(night.container.innerHTML).toBe(dayHtml);
  });
});
