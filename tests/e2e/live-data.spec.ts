import { expect, test } from "@playwright/test";

test.describe("Live data at NOW", () => {
  test("shows a LIVE badge at NOW for a site with a working live source, switches to FORECAST off NOW", async ({
    page,
  }) => {
    await page.goto("/");
    // hammar is first in SITES.md order among located sites, and has a
    // configured (and currently working, per docs/DATA_SOURCE_AUDIT.md)
    // Holfuy source.
    const markers = page.locator(".leaflet-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500); // let both forecast + live fetches settle
    await markers.first().click();

    const badge = page.getByTestId("site-sheet-source");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("LIVE");
    await expect(badge).toContainText("Holfuy");

    const status = page.getByTestId("site-sheet-status");
    const statusAtNow = await status.textContent();
    expect(statusAtNow).not.toContain("UNKNOWN");

    await page.getByTestId("time-slider-range").fill("24");
    await expect(badge).toContainText("FORECAST");
    await expect(badge).toContainText("Open-Meteo");
  });
});
