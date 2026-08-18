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
    await page.locator(".leaflet-marker-icon").first().waitFor();
    // wait for the forecast fetch (5 sites) to settle before taking the baseline count
    await page.waitForTimeout(1500);
    const countAfterLoad = forecastRequestCount;
    expect(countAfterLoad).toBeGreaterThan(0);

    const pane = page.locator(".leaflet-map-pane");
    const transformBefore = await pane.evaluate((el) => getComputedStyle(el).transform);

    const label = page.getByTestId("time-slider-label");
    await expect(label).toHaveText("NOW");

    const range = page.getByTestId("time-slider-range");
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
