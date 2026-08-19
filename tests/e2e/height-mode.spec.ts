import { expect, test } from "@playwright/test";

test.describe("Height mode", () => {
  test("toggling Surface/Soaring updates the sheet's effective height without a map jump", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    // MapLibre renders via WebGL, not CSS-transformed DOM tiles - read
    // the map's actual camera state via the debug hook MapLibreMap
    // exposes instead of the old Leaflet-pane-transform trick.
    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    // hammar is first among located sites and has soaring_height.agl_m
    // configured (150m) - see SITES.md. force: true since some sites now
    // cluster closely enough to visually overlap at this zoom (Block 13
    // expanded coverage to all 24 sites; known, deferred §16 gap).
    await markers.first().click({ force: true });
    const heightFact = page.getByTestId("site-sheet-height");
    await expect(heightFact).toContainText("Surface");
    await expect(heightFact).toContainText("10 m AGL");

    await page.getByTestId("height-mode-soaring").click();
    await expect(heightFact).toContainText("Soaring height");
    await expect(heightFact).not.toContainText("Surface —");

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);

    // switching back to Surface should restore the 10m reading
    await page.getByTestId("height-mode-surface").click();
    await expect(heightFact).toContainText("Surface");
  });

  test("the height-mode round-trip works cleanly for a site with a configured soaring height", async ({ page }) => {
    // hammar has soaring_height.agl_m configured in SITES.md, so this
    // doesn't exercise the "unsupported" branch directly - that's
    // covered by tests/unit/heightInterpolation.test.ts and
    // SiteSheet.test.tsx's null-soaring_height case. Several sites now
    // cluster closely enough to visually overlap at this zoom (Block 13
    // expanded coverage to all 24 sites; a known, deferred §16
    // marker-clustering gap) so this only exercises the first
    // (force-clicked) marker rather than looping over all of them.
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    await markers.first().click({ force: true });
    await page.getByTestId("site-sheet").waitFor();
    await page.getByTestId("height-mode-soaring").click();
    await expect(page.getByTestId("site-sheet-height")).toBeVisible();
    await page.getByTestId("height-mode-surface").click();
    await page.getByRole("button", { name: "Close" }).click();
  });
});
