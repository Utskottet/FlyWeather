import { expect, test } from "@playwright/test";

const WIND_LAYER_ID = "wind-particles";

test.describe("Animated wind particle field", () => {
  test("adds the custom WebGL layer on load and it actually animates (canvas changes over time)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await expect
      .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
      .toBe(true);

    const canvas = page.locator('[data-testid="site-map-canvas"] canvas').first();
    await page.waitForTimeout(1200);
    const frame1 = await canvas.screenshot();
    await page.waitForTimeout(1200);
    const frame2 = await canvas.screenshot();
    // Particles genuinely moved - two frames a second apart must differ,
    // not just "the layer exists" (a static/frozen layer would also pass
    // a presence-only check).
    expect(Buffer.compare(frame1, frame2)).not.toBe(0);
  });

  test("survives ROADS on/off basemap switches (re-added each time, no leftover stale layer)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await expect
      .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
      .toBe(true);

    // ROADS off -> Relief, ROADS on -> Topo (§ FlyWeather Interaction Model) -
    // two toggles exercise both basemap swaps the old 3-way selector did.
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("roads-toggle").click();
      await expect
        .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
        .toBe(true);
    }
  });

  test("site markers stay clickable with the wind layer active (WebGL layer never intercepts pointer events)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await page.locator(".rose-marker-icon").first().click({ force: true });
    await expect(page.getByTestId("site-sheet")).toBeVisible();
  });

  test("WIND toggle removes the animated layer entirely, not just pauses it, and restores it when re-enabled (§ FlyWeather Next UI)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });
    await expect
      .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
      .toBe(true);
    await expect(page.getByTestId("wind-toggle")).toHaveAttribute("aria-pressed", "true"); // on by default

    await page.getByTestId("wind-toggle").click();
    await expect
      .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
      .toBe(false);

    await page.getByTestId("wind-toggle").click();
    await expect
      .poll(() => page.evaluate((id) => window.__flyweatherMap!.getLayer(id) !== undefined, WIND_LAYER_ID))
      .toBe(true);
  });

  test("prefers-reduced-motion: no animated layer, static arrow markers shown instead", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

    const hasWindLayer = await page.evaluate(
      (id) => window.__flyweatherMap!.getLayer(id) !== undefined,
      WIND_LAYER_ID,
    );
    expect(hasWindLayer).toBe(false);
    await expect(page.locator(".wind-arrow-icon").first()).toBeVisible();
  });
});
