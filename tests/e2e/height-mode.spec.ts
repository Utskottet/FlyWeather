import { expect, test } from "@playwright/test";

test.describe("Height mode", () => {
  test("toggling Surface/Soaring updates the sheet's effective height without a map jump", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".leaflet-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    const pane = page.locator(".leaflet-map-pane");
    const transformBefore = await pane.evaluate((el) => getComputedStyle(el).transform);

    // hammar is first among located sites and has soaring_height.agl_m
    // configured (150m) - see SITES.md.
    await markers.first().click();
    const heightFact = page.getByTestId("site-sheet-height");
    await expect(heightFact).toContainText("Surface");
    await expect(heightFact).toContainText("10 m AGL");

    await page.getByTestId("height-mode-soaring").click();
    await expect(heightFact).toContainText("Soaring height");
    await expect(heightFact).not.toContainText("Surface —");

    const transformAfter = await pane.evaluate((el) => getComputedStyle(el).transform);
    expect(transformAfter).toBe(transformBefore);

    // switching back to Surface should restore the 10m reading
    await page.getByTestId("height-mode-surface").click();
    await expect(heightFact).toContainText("Surface");
  });

  test("the height-mode round-trip works cleanly for a site with a configured soaring height", async ({ page }) => {
    // All 5 currently-located sites (hammar, ravlunda, ven-n/sv/v) do
    // have soaring_height.agl_m configured in SITES.md, so this doesn't
    // exercise the "unsupported" branch directly - that's covered by
    // tests/unit/heightInterpolation.test.ts and SiteSheet.test.tsx's
    // null-soaring_height case. Ven's three sites sit close enough
    // together that at this zoom their markers visually overlap and
    // intercept each other's clicks (a real marker-clustering gap per
    // §16, out of scope for this block - noted in PROGRESS.md) so this
    // only exercises the first (unambiguous) marker rather than looping
    // over all of them.
    await page.goto("/");
    const markers = page.locator(".leaflet-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    await markers.first().click();
    await page.getByTestId("site-sheet").waitFor();
    await page.getByTestId("height-mode-soaring").click();
    await expect(page.getByTestId("site-sheet-height")).toBeVisible();
    await page.getByTestId("height-mode-surface").click();
    await page.getByRole("button", { name: "Close" }).click();
  });
});
