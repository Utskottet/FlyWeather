import { expect, test } from "@playwright/test";

test.describe("Time slider", () => {
  test("moving NOW -> +6h -> +24h updates the slider label without a map jump or extra forecast fetches", async ({
    page,
  }) => {
    // Forecast data is a static file published by scripts/collect-
    // forecasts.ts (server-side, on the weather-refresh cron), not a
    // live per-visitor Open-Meteo call - see docs/DECISIONS.md's
    // "production regression" entry. The invariant this test cares
    // about (moving the slider doesn't trigger new network fetches)
    // still applies, just against that static file instead.
    let forecastFileRequestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("generated/forecast-sites.json")) forecastFileRequestCount++;
    });

    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();

    const range = page.getByTestId("time-slider-range");
    // wait for the actual signal that forecast data has loaded (max stays
    // "0" - the empty-hours default - until useSiteForecasts resolves),
    // rather than a fixed sleep that can flake under network/CPU load.
    // Generous timeout: React StrictMode double-invokes effects in dev
    // (harmless in production, where StrictMode's double-invoke doesn't
    // happen), so every fetch fires twice against the dev server here.
    await expect(range).not.toHaveAttribute("max", "0", { timeout: 15_000 });
    // let any in-flight requests fully settle before taking the baseline
    await page.waitForTimeout(300);
    const countAfterLoad = forecastFileRequestCount;
    expect(countAfterLoad).toBeGreaterThan(0);

    // MapLibre renders via WebGL, not CSS-transformed DOM tiles - read
    // the map's actual camera state via the debug hook MapLibreMap
    // exposes instead of the old Leaflet-pane-transform trick.
    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    const label = page.getByTestId("time-slider-label");
    await expect(label).toHaveText("NOW");

    await range.fill("6");
    await expect(label).not.toHaveText("NOW");
    const labelAt6h = await label.textContent();

    await range.fill("24");
    const labelAt24h = await label.textContent();
    expect(labelAt24h).not.toBe(labelAt6h);

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);

    // no additional forecast-file requests should have fired for slider movement alone
    expect(forecastFileRequestCount).toBe(countAfterLoad);

    await page.getByTestId("time-slider-now-button").click();
    await expect(label).toHaveText("NOW");
  });
});
