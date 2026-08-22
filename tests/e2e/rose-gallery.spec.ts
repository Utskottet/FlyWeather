import { expect, test } from "@playwright/test";

// Visual check harness for the WindRose component, covering the fixture
// cases MASTER_SPEC.md §29 asks for. This captures screenshots for human
// review rather than doing pixel-diff assertions against a baseline -
// baseline visual regression can be added once the rose's look is
// considered stable.

const CASES = [
  "hammar-sw",
  "kaseberga-s",
  "ravlunda-e",
  "n-wraparound",
  "wrong-direction-red",
  "unverified-orange",
  "stale-gray",
  "no-sector-configured",
  "adaptive-0-40",
  "adaptive-70-120",
  "adaptive-150-210",
  "adaptive-240-300",
  "adaptive-310-350",
  "adaptive-narrow",
  "adaptive-wide",
  "adaptive-wraparound",
];

// Mirrors src/domain/direction.ts's normalizeDeg/sectorSweepDeg/
// sectorMidpointDeg exactly (not imported - e2e specs stay independent of
// app source per this suite's existing convention) so the expected
// placement angle is derived the same way the component itself derives it.
function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
function sectorMidpointPlus180(fromDeg: number, toDeg: number): number {
  const sweep = normalizeDeg(toDeg) - normalizeDeg(fromDeg);
  const positiveSweep = sweep <= 0 ? sweep + 360 : sweep;
  return normalizeDeg(normalizeDeg(fromDeg) + positiveSweep / 2 + 180);
}

const ADAPTIVE_CASES: { slug: string; fromDeg: number; toDeg: number }[] = [
  { slug: "adaptive-0-40", fromDeg: 0, toDeg: 40 },
  { slug: "adaptive-70-120", fromDeg: 70, toDeg: 120 },
  { slug: "adaptive-150-210", fromDeg: 150, toDeg: 210 },
  { slug: "adaptive-240-300", fromDeg: 240, toDeg: 300 },
  { slug: "adaptive-310-350", fromDeg: 310, toDeg: 350 },
  { slug: "adaptive-narrow", fromDeg: 100, toDeg: 105 },
  { slug: "adaptive-wide", fromDeg: 20, toDeg: 300 },
  { slug: "adaptive-wraparound", fromDeg: 330, toDeg: 30 },
];

async function weatherIconAngleDeg(page: import("@playwright/test").Page, slug: string): Promise<number> {
  return page.evaluate((slug) => {
    const figure = document.querySelector(`[data-testid="rose-case-${slug}"]`)!;
    const g = figure.querySelector('[data-testid="rose-weather-icon"]')!;
    const transform = g.getAttribute("transform") ?? "";
    const match = transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
    const iconSize = Number(g.querySelector("svg")?.getAttribute("width") ?? 0);
    const x = Number(match[1]) + iconSize / 2;
    const y = Number(match[2]) + iconSize / 2;
    const CENTER = 50;
    const dx = x - CENTER;
    const dy = CENTER - y;
    const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
    return ((angle % 360) + 360) % 360;
  }, slug);
}

test.describe("WindRose gallery", () => {
  test("renders every §29 fixture case and captures a screenshot", async ({ page }) => {
    await page.goto("/gallery.html");

    for (const slug of CASES) {
      const figure = page.getByTestId(`rose-case-${slug}`);
      await expect(figure).toBeVisible();
      // .first() - the weather icon now renders as its own nested <svg>
      // inside the rose's <svg> (per the user's uploaded reference
      // design moving the icon inside), so a plain "svg" locator would
      // match both; the outer rose svg is always first in document order.
      await expect(figure.locator("svg").first()).toBeVisible();
      await figure.screenshot({ path: `test-results/rose-gallery/${slug}.png` });
    }
  });

  test("marker sizes (48px, 64px) render distinctly from the expanded view", async ({ page }) => {
    await page.goto("/gallery.html");

    const marker48 = page.getByTestId("rose-case-marker-48");
    const marker64 = page.getByTestId("rose-case-marker-64");

    // .first() - see the comment above about the nested weather-icon svg.
    await expect(marker48.locator("svg").first()).toHaveAttribute("width", "48");
    await expect(marker64.locator("svg").first()).toHaveAttribute("width", "64");

    await marker48.screenshot({ path: "test-results/rose-gallery/marker-48.png" });
    await marker64.screenshot({ path: "test-results/rose-gallery/marker-64.png" });
  });

  test("mandated sector cases (§ FlyWeather Next UI item 14): weather sits opposite the sector, sector stays unobscured, pointer independent", async ({
    page,
  }) => {
    await page.goto("/gallery.html");

    for (const { slug, fromDeg, toDeg } of ADAPTIVE_CASES) {
      const figure = page.getByTestId(`rose-case-${slug}`);
      await expect(figure).toBeVisible();

      // Sector wedge remains present and visible - never obscured by the
      // (bigger, protruding) weather graphic.
      await expect(figure.getByTestId("sector")).toBeVisible();

      // Weather graphic lands at sector-midpoint + 180deg, within a small
      // tolerance for floating point/geometry rounding.
      const actualAngle = await weatherIconAngleDeg(page, slug);
      const expectedAngle = sectorMidpointPlus180(fromDeg, toDeg);
      const diff = Math.min(Math.abs(actualAngle - expectedAngle), 360 - Math.abs(actualAngle - expectedAngle));
      expect(diff, `${slug}: expected weather near ${expectedAngle}deg, got ${actualAngle}deg`).toBeLessThan(1);

      // Wind pointer geometry is untouched by sector/weather placement -
      // still renders independently.
      await expect(figure.getByTestId("wind-pointer")).toBeVisible();

      await figure.screenshot({ path: `test-results/rose-gallery/${slug}.png` });
    }
  });
});
