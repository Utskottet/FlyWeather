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
});
