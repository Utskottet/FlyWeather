import { expect, test } from "@playwright/test";

test.describe("Time slider", () => {
  test("moving NOW -> +6h -> +24h updates the slider label without a map jump or extra forecast fetches", async ({
    page,
  }) => {
    let forecastRequestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("api.open-meteo.com")) forecastRequestCount++;
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
    const countAfterLoad = forecastRequestCount;
    expect(countAfterLoad).toBeGreaterThan(0);

    const pane = page.locator(".leaflet-map-pane");
    const transformBefore = await pane.evaluate((el) => getComputedStyle(el).transform);

    const label = page.getByTestId("time-slider-label");
    await expect(label).toHaveText("NOW");

    await range.fill("6");
    await expect(label).not.toHaveText("NOW");
    const labelAt6h = await label.textContent();

    await range.fill("24");
    const labelAt24h = await label.textContent();
    expect(labelAt24h).not.toBe(labelAt6h);

    const transformAfter = await pane.evaluate((el) => getComputedStyle(el).transform);
    expect(transformAfter).toBe(transformBefore);

    // no additional forecast requests should have fired for slider movement alone
    expect(forecastRequestCount).toBe(countAfterLoad);

    await page.getByTestId("time-slider-now-button").click();
    await expect(label).toHaveText("NOW");
  });
});
