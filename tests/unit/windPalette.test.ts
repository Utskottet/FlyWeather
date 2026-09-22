import { describe, expect, it } from "vitest";
import { WIND_SPEED_COLOR_STOPS, speedToColor } from "../../src/domain/windField.ts";

/**
 * The wind palette has to stay readable on a grey basemap, and has to be
 * one palette rather than two.
 *
 * Both of those were broken at once. The animated field and the
 * reduced-motion arrow fallback each carried their own copy of the same
 * five hex values, under a comment asserting they matched "exactly" -
 * the arrangement that lets two lists drift apart silently. And the cool
 * end was pale enough to vanish: calm was #90caf9 at a perceived
 * brightness of ~190, against land at ~206. Reported from a phone: "in
 * low wind it's really hard to see against the grey sea."
 */

/** The basemap this has to be legible against - mapStyles.ts. */
const SEA = [0x8c, 0x94, 0xa1] as const;
const LAND = [0xc1, 0xd3, 0xda] as const;

/**
 * Perceived brightness, the classic luma weighting. Not WCAG contrast:
 * that is defined for text on a solid background, and these are 4 px
 * translucent streaks over a photograph-like shaded relief. Luma
 * distance is the honest approximation, used here only to catch a stop
 * drifting back into the background's own range.
 */
function brightness([r, g, b]: readonly number[]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const SEA_BRIGHTNESS = brightness(SEA);
const LAND_BRIGHTNESS = brightness(LAND);

/** How far a stop must sit from a background before it reads as separate. */
const MIN_BRIGHTNESS_SEPARATION = 25;

describe("wind speed palette", () => {
  it("keeps the cool end clearly darker than both sea and land", () => {
    // Blue and green carry no hue advantage over a blue-grey basemap, so
    // brightness is all they have. The warm stops are exempt below.
    for (const stop of WIND_SPEED_COLOR_STOPS.filter((s) => s.speedMs <= 5)) {
      const b = brightness(stop.rgb);
      expect(b, `stop at ${stop.speedMs} m/s vs sea`).toBeLessThan(SEA_BRIGHTNESS - MIN_BRIGHTNESS_SEPARATION);
      expect(b, `stop at ${stop.speedMs} m/s vs land`).toBeLessThan(LAND_BRIGHTNESS - MIN_BRIGHTNESS_SEPARATION);
    }
  });

  it("separates every stop from its neighbour, so speed stays readable", () => {
    for (let i = 1; i < WIND_SPEED_COLOR_STOPS.length; i++) {
      const prev = WIND_SPEED_COLOR_STOPS[i - 1].rgb;
      const next = WIND_SPEED_COLOR_STOPS[i].rgb;
      const distance = Math.hypot(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      expect(distance, `stops ${i - 1} and ${i} are too close to tell apart`).toBeGreaterThan(40);
    }
  });

  it("stays a blue-to-red progression - calm is never warmer than a gale", () => {
    const calm = WIND_SPEED_COLOR_STOPS[0].rgb;
    const gale = WIND_SPEED_COLOR_STOPS[WIND_SPEED_COLOR_STOPS.length - 1].rgb;
    // red minus blue: negative for a cool colour, positive for a warm one.
    expect(calm[0] - calm[2]).toBeLessThan(0);
    expect(gale[0] - gale[2]).toBeGreaterThan(0);
  });

  it("clamps rather than extrapolating past either end", () => {
    expect(speedToColor(-5)).toEqual(speedToColor(0));
    expect(speedToColor(99)).toEqual(speedToColor(WIND_SPEED_COLOR_STOPS[WIND_SPEED_COLOR_STOPS.length - 1].speedMs));
  });

  it("returns channels in the 0-1 range the WebGL layer expects", () => {
    for (const speed of [0, 1, 3, 6, 9, 15]) {
      for (const channel of speedToColor(speed)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
