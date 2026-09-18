import { test, expect, type Page } from "@playwright/test";

/**
 * North is up, always. The map is never tilted and never rotated.
 *
 * Guarded by a test rather than trusting the constructor options because
 * there are several independent routes into a turned map - ctrl/right drag,
 * a two-finger touch gesture, the keyboard arrows - and each is switched
 * off by a different setting. Disabling one and assuming the rest follow is
 * exactly how this regresses.
 *
 * It matters more here than on a general-purpose map: the whole interface
 * reads wind direction off a compass rose. A map that has quietly rotated
 * twenty degrees makes every bearing on screen wrong.
 */

async function orientation(page: Page): Promise<{ pitch: number; bearing: number }> {
  return page.evaluate(() => ({
    pitch: window.__flyweatherMap?.getPitch() ?? -1,
    bearing: window.__flyweatherMap?.getBearing() ?? -1,
  }));
}

async function mapCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-testid="site-map"]').boundingBox();
  if (!box) throw new Error("map not found");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
});

test("starts flat and north-up", async ({ page }) => {
  expect(await orientation(page)).toEqual({ pitch: 0, bearing: 0 });
});

test("a ctrl-drag cannot tilt or rotate it", async ({ page }) => {
  const centre = await mapCentre(page);
  await page.keyboard.down("Control");
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 160, centre.y - 120, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.waitForTimeout(400);

  expect(await orientation(page)).toEqual({ pitch: 0, bearing: 0 });
});

test("a right-drag cannot rotate it", async ({ page }) => {
  const centre = await mapCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 200, centre.y + 80, { steps: 12 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);

  expect(await orientation(page)).toEqual({ pitch: 0, bearing: 0 });
});

test("the keyboard arrows pan but never rotate", async ({ page }) => {
  // Focused directly rather than clicked: the map's corners are covered by
  // the app's own controls, so a click there lands on a button instead.
  await page.locator('[data-testid="site-map"] canvas').first().focus();
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(400);

  expect(await orientation(page)).toEqual({ pitch: 0, bearing: 0 });
});

test("even a programmatic tilt is refused - maxPitch is the backstop", async ({ page }) => {
  // Nothing in the app does this, but a future feature reaching for
  // easeTo/jumpTo should not be able to tilt the map by accident.
  await page.evaluate(() => window.__flyweatherMap?.jumpTo({ pitch: 55, bearing: 90 }));
  await page.waitForTimeout(400);

  const { pitch } = await orientation(page);
  expect(pitch).toBe(0);
});

test("panning and zooming still work - this disables orientation, not interaction", async ({ page }) => {
  const before = await page.evaluate(() => ({
    zoom: window.__flyweatherMap!.getZoom(),
    lng: window.__flyweatherMap!.getCenter().lng,
  }));

  const centre = await mapCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 150, centre.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => ({
    zoom: window.__flyweatherMap!.getZoom(),
    lng: window.__flyweatherMap!.getCenter().lng,
  }));

  expect(after.lng).not.toBeCloseTo(before.lng, 4);
  expect(after.zoom).toBeCloseTo(before.zoom, 4);
  expect(await orientation(page)).toEqual({ pitch: 0, bearing: 0 });
});
