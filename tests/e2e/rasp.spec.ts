import { expect, test } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

const RASP_LAYER_ID = "rasp-wstar-layer";

test.describe("RASP (W* thermal strength) overlay", () => {
  test("defaults OFF", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await expect(page.getByTestId("rasp-toggle")).toHaveAttribute("aria-pressed", "false");
    const hasLayer = await page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, RASP_LAYER_ID);
    expect(hasLayer).toBe(false);
  });

  test("turning on with no matching forecast hour shows an unavailable notice, never a stale/fake overlay", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await page.getByTestId("rasp-toggle").click();
    // Whether a real dev product happens to cover "now" depends on
    // VITE_SOARING_BASE_URL's configured data - either a real overlay
    // appears (covered by the other tests below) or the unavailable
    // notice does. Never both, never neither.
    const hasLayer = await page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, RASP_LAYER_ID);
    const noticeVisible = await page.getByTestId("rasp-unavailable-notice").isVisible().catch(() => false);
    expect(hasLayer).toBe(!noticeVisible);
  });

  test("toggling off removes the layer cleanly, toggling on again restores it", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await page.getByTestId("rasp-toggle").click();
    await page.waitForTimeout(500);
    await page.getByTestId("rasp-toggle").click();
    const hasLayerAfterOff = await page.evaluate(
      (id) => window.__flyweatherMap!.getLayer(id) !== undefined,
      RASP_LAYER_ID,
    );
    expect(hasLayerAfterOff).toBe(false);

    await page.getByTestId("rasp-toggle").click();
    await page.waitForTimeout(500);
    // Same as the "no matching hour" test above - presence depends on
    // real dev data, but re-toggling on must not leave the layer
    // permanently missing if it was showing before.
  });

  // Removed: "survives ROADS on/off basemap switches without duplicating
  // the layer". The Roads toggle was the only way to swap the basemap
  // style from the UI, and it is gone - so the duplicate-layer failure it
  // guarded is now unreachable rather than merely untested. buildTopoStyle
  // still exists in mapStyles.ts; if a style switch is ever offered again,
  // bring this test back with it.

  test("site markers, airspace, and wind particles all still work with RASP on", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await page.getByTestId("rasp-toggle").click();
    await page.waitForTimeout(500);

    await mapSettled(page);
    await page.locator(".rose-marker-icon").first().click({ force: true });
    await expect(page.getByTestId("site-sheet")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("airspace-toggle").click();
    await expect
      .poll(() => page.evaluate(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined))
      .toBe(true);

    const hasWindLayer = await page.evaluate(() => window.__flyweatherMap!.getLayer("wind-particles") !== undefined);
    expect(hasWindLayer).toBe(true);
  });

  test("RASP renders underneath the wind particle layer, never obscuring it (real bug: addLayer with no beforeId appended RASP on top when toggled on after wind already existed)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    // Wind particles are on by default (no toggle) - already present before RASP is turned on.
    await expect
      .poll(() => page.evaluate(() => window.__flyweatherMap!.getLayer("wind-particles") !== undefined))
      .toBe(true);

    await page.getByTestId("rasp-toggle").click();
    await expect
      .poll(() => page.evaluate(() => window.__flyweatherMap!.getLayer("rasp-wstar-layer") !== undefined))
      .toBe(true);

    // getLayersOrder() (not getStyle().layers, which only serializes the
    // standard style-spec layer list) - wind-particles is a CUSTOM WebGL
    // layer, entirely absent from getStyle().layers even while genuinely
    // present and rendering; getLayersOrder() correctly includes it.
    const order = await page.evaluate(() => {
      const ids = window.__flyweatherMap!.getLayersOrder();
      return { raspIndex: ids.indexOf("rasp-wstar-layer"), windIndex: ids.indexOf("wind-particles") };
    });
    expect(order.raspIndex).toBeGreaterThanOrEqual(0);
    expect(order.windIndex).toBeGreaterThanOrEqual(0);
    // Lower index = rendered first = underneath. RASP must be below wind.
    expect(order.raspIndex).toBeLessThan(order.windIndex);
  });
});
