import { expect, test } from "@playwright/test";

test.describe("Altitude slider + START (§ FlyWeather Interaction Model)", () => {
  test("moving altitude above Surface exits live mode and updates the sheet without a map jump; START returns to Surface", async ({
    page,
  }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    // MapLibre renders via WebGL, not CSS-transformed DOM tiles - read the
    // map's actual camera state via the debug hook MapLibreMap exposes.
    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    await markers.first().click({ force: true });
    const heightFact = page.getByTestId("site-sheet-height");
    await expect(heightFact).toContainText("10 m AGL");

    const startButton = page.getByTestId("start-button");
    const altitudeLabel = page.getByTestId("altitude-slider-label");
    const provenance = page.getByTestId("provenance-line");
    await expect(startButton).toBeDisabled();
    await expect(altitudeLabel).toHaveText("Surface");
    await expect(provenance).toHaveText("Sites: live · Map/RASP: forecast");

    // f=0.5 round-trips to exactly 150m (tests/unit/altitudeAxis.test.ts).
    await page.getByTestId("altitude-slider-range").fill("0.5");
    await expect(altitudeLabel).toHaveText("150 m AGL");
    await expect(heightFact).not.toContainText("10 m AGL");
    await expect(provenance).toHaveText("Sites, map & RASP: forecast");
    await expect(startButton).toBeEnabled();

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);

    // START is the only way back - it must restore Surface + live wind together.
    await startButton.click();
    await expect(altitudeLabel).toHaveText("Surface");
    await expect(heightFact).toContainText("10 m AGL");
    await expect(provenance).toHaveText("Sites: live · Map/RASP: forecast");
    await expect(startButton).toBeDisabled();
  });

  test("START also resets time, and moving time alone exits live mode", async ({ page }) => {
    await page.goto("/");
    const range = page.getByTestId("time-slider-range");
    await expect(range).not.toHaveAttribute("max", "0", { timeout: 15_000 });

    const startButton = page.getByTestId("start-button");
    const provenance = page.getByTestId("provenance-line");
    await expect(startButton).toBeDisabled();

    await range.fill("6");
    await expect(page.getByTestId("time-slider-label")).not.toHaveText("NOW");
    await expect(provenance).toHaveText("Sites, map & RASP: forecast");
    await expect(startButton).toBeEnabled();

    await startButton.click();
    await expect(page.getByTestId("time-slider-label")).toHaveText("NOW");
    await expect(provenance).toHaveText("Sites: live · Map/RASP: forecast");
    await expect(startButton).toBeDisabled();
  });
});
