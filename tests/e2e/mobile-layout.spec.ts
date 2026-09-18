import { test, expect } from "@playwright/test";

/**
 * On a phone the map is the point, so the chrome around it is held to a
 * budget and the layer controls stop being a panel.
 *
 * Measured rather than eyeballed, because every one of these regressed at
 * least once while being built: the controls stacked down the corner the
 * map is dragged from, a "reduced" tick row that was taller than the one
 * it replaced, and a notice sitting on top of the toggles.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function heightOf(page: import("@playwright/test").Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  return box ? box.height : 0;
}

test.describe("phone layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  });

  test("chrome stays under a third of the screen", async ({ page }) => {
    const chrome =
      (await heightOf(page, ".app-header")) +
      (await heightOf(page, ".map-controls")) +
      (await heightOf(page, ".bottom-bar"));

    // It was 42% before this budget existed. 30% leaves room to add a
    // control without silently eating the map again.
    expect(chrome / PHONE.height).toBeLessThan(0.3);
  });

  test("the layer switches are inline: no title, no disclosure, always visible", async ({ page }) => {
    await expect(page.locator('[data-testid="map-layers-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="map-layers-panel-body"]')).toBeVisible();
    await expect(page.locator('[data-testid="airspace-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="rasp-toggle"]')).toBeVisible();
  });

  test("Roads is dropped entirely - the one layer a small screen can afford to lose", async ({ page }) => {
    await expect(page.locator('[data-testid="roads-toggle"]')).toHaveCount(0);
  });

  test("no zoom buttons - pinch does that, and the corner is needed", async ({ page }) => {
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toHaveCount(0);
  });

  test("altitude is a permanent slider, not a button hiding its own value", async ({ page }) => {
    await expect(page.locator('[data-testid="height-control-button"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="altitude-control"]')).toBeVisible();
  });

  test("altitude runs parallel to time but stays the shorter of the two", async ({ page }) => {
    // It is a modifier, not the primary control, and should read as one.
    const altitude = (await page.locator('[data-testid="altitude-control"] input').boundingBox())!;
    const time = (await page.locator('[data-testid="time-slider-range"]').boundingBox())!;
    expect(altitude.width).toBeLessThan(time.width);
    expect(altitude.y).toBeLessThan(time.y);
  });

  test("no control advertises a disclosure it does not have", async ({ page }) => {
    // RASP's parameter selector follows the overlay being on; it never
    // expanded on tap, so the chevron it used to carry was a promise the
    // control could not keep.
    await expect(page.locator('[data-testid="rasp-toggle"]')).not.toContainText("▸");
  });

  test("the controls sit in one row, not a column down the corner", async ({ page }) => {
    const mode = (await page.locator(".site-mode-toggle").first().boundingBox())!;
    const layers = (await page.locator('[data-testid="map-layers-panel"]').boundingBox())!;
    // Same row: their vertical centres are close, rather than stacked.
    expect(Math.abs(mode.y - layers.y)).toBeLessThan(20);
    expect(layers.x).toBeGreaterThan(mode.x);
  });

  test("the stale-data notice does not sit on top of the controls", async ({ page }) => {
    const notice = await page.locator('[data-testid="data-staleness-notice"]').boundingBox().catch(() => null);
    test.skip(notice === null, "forecast is fresh, no notice to collide");
    const controls = (await page.locator(".map-controls").boundingBox())!;
    expect(notice!.y).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
  });
});

test.describe("desktop keeps the full arrangement", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  });

  test("keeps the titled panel, Roads, and the zoom buttons", async ({ page }) => {
    // The phone layout is a different arrangement, not a smaller copy -
    // so none of what it drops should go missing here.
    await expect(page.locator('[data-testid="map-layers-toggle"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="roads-toggle"]')).toHaveCount(1);
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toHaveCount(1);
  });
});
