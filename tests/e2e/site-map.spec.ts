import { expect, test } from "@playwright/test";

const LOCATED_SITE_COUNT = 12; // 12 sites disabled to shrink the working set (see PROGRESS.md's site-catalogue-trim entry) - was 24 pre-trim

test.describe("Site map", () => {
  test("renders the map with one marker per located enabled site", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("site-map")).toBeVisible();
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
  });

  test("tapping a marker opens the site sheet, closing dismisses it", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);

    // force: true - with all 24 sites now located (Block 13), several
    // cluster closely enough at this zoom to visually overlap (a known,
    // deferred §16 marker-clustering gap, not something this test
    // exercises); force bypasses Playwright's overlap-interception check.
    await markers.first().click({ force: true });
    const sheet = page.getByTestId("site-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("h2")).not.toBeEmpty();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible();
  });

  test("Soaring/Winch site-mode toggle switches the displayed set without a map jump", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    // Neither winch-brandstad nor winch-urasa has a verified coordinate
    // yet (see docs/SITE_DATA_AUDIT.md) - Winch mode is honestly empty,
    // not a fabricated placement, so this checks the empty-state notice
    // rather than any markers.
    await page.getByTestId("site-mode-winch").click();
    await expect(markers).toHaveCount(0);
    await expect(page.locator(".site-mode-empty-notice")).toBeVisible();

    const viewDuringWinch = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewDuringWinch).toEqual(viewBefore);

    await page.getByTestId("site-mode-soaring").click();
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
    await expect(page.locator(".site-mode-empty-notice")).not.toBeVisible();

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);
  });

  test("Airspace toggle adds/removes the layer without a map jump, off by default", async ({ page }) => {
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

    // off by default (Block 17: opt-in reference info, not default clutter)
    await expect(page.getByTestId("airspace-off")).toHaveClass(/active/);
    const hasLayerBefore = await page.evaluate(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined);
    expect(hasLayerBefore).toBe(false);

    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    await page.getByTestId("airspace-on").click();
    await page.waitForFunction(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined);

    const viewDuring = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewDuring).toEqual(viewBefore);

    await page.getByTestId("airspace-off").click();
    await expect
      .poll(() => page.evaluate(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined))
      .toBe(false);

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);
  });

  for (const width of [360, 390, 430]) {
    test(`no horizontal overflow at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("site-map")).toBeVisible();
      // MapLibre's WebGL canvas has no per-tile DOM class to wait on the
      // way Leaflet's did - wait on the "load" flag MapLibreMap exposes.
      await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await page.screenshot({ path: `test-results/site-map/mobile-${width}.png` });
    });
  }
});
