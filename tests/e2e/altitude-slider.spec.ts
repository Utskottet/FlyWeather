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
    // Never disabled (§ FlyWeather Mobile UI Correction) - START stays
    // clickable at all times; aria-pressed conveys "you are here now".
    await expect(startButton).toBeEnabled();
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
    await expect(altitudeLabel).toHaveText("Surface");
    await expect(provenance).toHaveText("Sites: live · Map/RASP: forecast");

    // f=0.55 round-trips to exactly 70m (tests/unit/altitudeAxis.test.ts).
    await page.getByTestId("altitude-slider-range").fill("0.55");
    await expect(altitudeLabel).toHaveText("70 m AGL");
    await expect(heightFact).not.toContainText("10 m AGL");
    await expect(provenance).toHaveText("Sites, map & RASP: forecast");
    await expect(startButton).toHaveAttribute("aria-pressed", "false");

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
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });

  test("altitude slider never offers a value above the real 180m data ceiling", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    const range = page.getByTestId("altitude-slider-range");
    await expect(range).toHaveAttribute("max", "1");
    await range.fill("1"); // the slider's own max
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("180 m AGL");
  });

  test("START also resets time, and moving time alone exits live mode", async ({ page }) => {
    await page.goto("/");
    const range = page.getByTestId("time-slider-range");
    await expect(range).not.toHaveAttribute("max", "0", { timeout: 15_000 });

    const startButton = page.getByTestId("start-button");
    const provenance = page.getByTestId("provenance-line");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");

    await range.fill("6");
    await expect(page.getByTestId("time-slider-label")).not.toHaveText("NOW");
    await expect(provenance).toHaveText("Sites, map & RASP: forecast");
    await expect(startButton).toHaveAttribute("aria-pressed", "false");

    await startButton.click();
    await expect(page.getByTestId("time-slider-label")).toHaveText("NOW");
    await expect(provenance).toHaveText("Sites: live · Map/RASP: forecast");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });
});
