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

  test("the data status is on the bar, not hidden behind the menu", async ({ page }) => {
    // Whether you are looking at a measurement or at a model is the most
    // important thing on the page. It used to live inside the hamburger
    // menu on a phone, which is to say behind a tap nobody makes.
    const status = page.locator('[data-testid="app-header-status"]');
    await expect(status).toBeVisible();
    await expect(page.getByTestId("source-status-sites")).toBeVisible();
    await expect(page.getByTestId("source-status-wind")).toBeVisible();

    // And it is on the same row as the logo, not stacked under it.
    const logo = (await page.locator(".app-header-logo").boundingBox())!;
    const box = (await status.boundingBox())!;
    expect(box.x).toBeGreaterThan(logo.x + logo.width);
    expect(Math.abs(box.y + box.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(16);
  });

  test("the status never collides with the menu button or overflows the bar", async ({ page }) => {
    const status = (await page.locator('[data-testid="app-header-status"]').boundingBox())!;
    const menu = (await page.locator(".app-header-menu-button").boundingBox())!;
    expect(status.x + status.width).toBeLessThanOrEqual(menu.x + 1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("the menu holds only what belongs in a menu", async ({ page }) => {
    await page.locator('[data-testid="header-menu-toggle"]').click();
    await expect(page.locator('[data-testid="header-menu-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-header-status-panel"]')).toHaveCount(0);
  });

  test("no BETA badge taking up the room the status needs", async ({ page }) => {
    await expect(page.locator('[data-testid="app-header-beta"]')).toHaveCount(0);
  });

  test("no zoom buttons - pinch does that, and the corner is needed", async ({ page }) => {
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toHaveCount(0);
  });

  test("height is a button that shows its own value; the slider stays out of the way until asked for", async ({ page }) => {
    // The old tool-stack HEIGHT control stays gone, and the phone no longer
    // keeps a permanent slider (it forced the bar to be tall). The button's
    // label *is* the value, so nothing is hidden while it is collapsed.
    await expect(page.locator('[data-testid="height-control-button"]')).toHaveCount(0);
    await expect(page.getByTestId("mobile-height-button")).toBeVisible();
    await expect(page.getByTestId("mobile-height-value")).toHaveText("Surface");
    await expect(page.getByTestId("altitude-slider-range")).toHaveCount(0);

    await page.getByTestId("mobile-height-button").click();
    await expect(page.getByTestId("altitude-slider-range")).toBeVisible();
  });

  test("live wind reading sits beside the timeline; height is a slim row below", async ({ page }) => {
    // Phone arrangement revised 2026-10-06: the bar floats clear of the
    // bottom gesture area and is one slim row - Live wind reading a large
    // target beside the day strip - with the height button below it.
    const live = (await page.locator('[data-testid="start-button"]').boundingBox())!;
    const time = (await page.locator('[data-testid="mobile-timeline-scroll"]').boundingBox())!;
    const height = (await page.locator('[data-testid="mobile-height-button"]').boundingBox())!;

    // Live wind is left of the timeline, and a large target.
    expect(live.x + live.width).toBeLessThanOrEqual(time.x + 2);
    expect(live.height).toBeGreaterThan(60);
    expect(time.width).toBeGreaterThan(150);
    // Height is on its own row below the main row.
    expect(height.y).toBeGreaterThanOrEqual(live.y + live.height - 2);
  });

  test("no control advertises a disclosure it does not have", async ({ page }) => {
    // RASP's parameter selector follows the overlay being on; it never
    // expanded on tap, so the chevron it used to carry was a promise the
    // control could not keep.
    await expect(page.locator('[data-testid="rasp-toggle"]')).not.toContainText("▸");
  });

  test("the layer switches sit clear of the map's top-left corner", async ({ page }) => {
    // The Ridge/Winch toggle used to share this row; with it gone the
    // layer switches are all that is up here, and they must still not
    // creep down the corner you drag the map from.
    const layers = (await page.locator('[data-testid="map-layers-panel"]').boundingBox())!;
    expect(layers.height).toBeLessThan(60);
  });

  test("the stale-data notice does not sit on top of the controls", async ({ page }) => {
    // Counted first rather than measured first. boundingBox() WAITS for an
    // element, so on a fresh forecast - when there is no notice, which is
    // the normal case - it sat there until the test timed out, and the
    // .catch() that was meant to handle "no notice" never ran in time.
    const notice = page.locator('[data-testid="data-staleness-notice"]');
    test.skip((await notice.count()) === 0, "forecast is fresh, no notice to collide");
    const box = (await notice.boundingBox())!;
    const controls = (await page.locator(".map-controls").boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
  });
});

test.describe("desktop keeps the full arrangement", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  });

  test("keeps the zoom buttons, and has no panel or Roads either", async ({ page }) => {
    // The layer switches are inline on every screen now, and Roads is gone
    // everywhere rather than only on a phone - so the desktop difference is
    // just the zoom buttons, which pinch replaces on touch.
    await expect(page.locator('[data-testid="map-layers-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="roads-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="map-layers-panel-body"]')).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toHaveCount(1);
  });
});
