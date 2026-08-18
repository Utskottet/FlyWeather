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
];

test.describe("WindRose gallery", () => {
  test("renders every §29 fixture case and captures a screenshot", async ({ page }) => {
    await page.goto("/gallery.html");

    for (const slug of CASES) {
      const figure = page.getByTestId(`rose-case-${slug}`);
      await expect(figure).toBeVisible();
      await expect(figure.locator("svg")).toBeVisible();
      await figure.screenshot({ path: `test-results/rose-gallery/${slug}.png` });
    }
  });

  test("marker sizes (48px, 64px) render distinctly from the expanded view", async ({ page }) => {
    await page.goto("/gallery.html");

    const marker48 = page.getByTestId("rose-case-marker-48");
    const marker64 = page.getByTestId("rose-case-marker-64");

    await expect(marker48.locator("svg")).toHaveAttribute("width", "48");
    await expect(marker64.locator("svg")).toHaveAttribute("width", "64");

    await marker48.screenshot({ path: "test-results/rose-gallery/marker-48.png" });
    await marker64.screenshot({ path: "test-results/rose-gallery/marker-64.png" });
  });
});
