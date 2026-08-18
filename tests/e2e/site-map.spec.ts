import { expect, test } from "@playwright/test";

const LOCATED_SITE_COUNT = 5; // hammar, ravlunda, ven-n, ven-sv, ven-v (see docs/SITE_DATA_AUDIT.md)

test.describe("Site map", () => {
  test("renders the map with one marker per located enabled site", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("site-map")).toBeVisible();
    const markers = page.locator(".leaflet-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
  });

  test("tapping a marker opens the site sheet, closing dismisses it", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".leaflet-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);

    await markers.first().click();
    const sheet = page.getByTestId("site-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("h2")).not.toBeEmpty();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible();
  });

  for (const width of [360, 390, 430]) {
    test(`no horizontal overflow at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("site-map")).toBeVisible();
      await page.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 10_000 });

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await page.screenshot({ path: `test-results/site-map/mobile-${width}.png` });
    });
  }
});
