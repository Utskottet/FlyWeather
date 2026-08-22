import { expect, test } from "@playwright/test";

test.describe("HEIGHT control + START (§ FlyWeather GUI Reorganization + Coherent Height Wind)", () => {
  test("moving HEIGHT above Surface exits live mode and updates the sheet without a map jump; START returns to Surface", async ({
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

    const startButton = page.getByTestId("start-button");
    const heightButton = page.getByTestId("height-control-button");
    // Never disabled (§ FlyWeather Mobile UI Correction) - START stays
    // clickable at all times; aria-pressed conveys "you are here now".
    await expect(startButton).toBeEnabled();
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
    await expect(heightButton).toContainText("HEIGHT");
    await expect(heightButton).not.toContainText(/[0-9]/);
    await expect(page.getByTestId("source-status-sites")).toContainText("MEASURED");
    await expect(page.getByTestId("source-status-wind")).toContainText("FORECAST");

    await markers.first().click({ force: true });
    const heightFact = page.getByTestId("site-sheet-height");
    await expect(heightFact).toContainText("10 m AGL");
    // The site-sheet is a modal-like drawer (role="dialog") that sits above
    // the top-left tool stack while open (z-index) - close it before
    // reaching for HEIGHT, the same as a real user would have to.
    await page.getByRole("button", { name: "Close" }).click();

    // HEIGHT is collapsible - the slider only exists once opened, and
    // collapsing it again must never reset the selected altitude.
    await expect(page.getByTestId("height-control-slider")).toHaveCount(0);
    await heightButton.click();
    const altitudeLabel = page.getByTestId("altitude-slider-label");
    await expect(altitudeLabel).toHaveText("Surface");

    // f=0.55 round-trips to exactly 70m (tests/unit/altitudeAxis.test.ts).
    await page.getByTestId("altitude-slider-range").fill("0.55");
    await expect(altitudeLabel).toHaveText("70 m AGL");
    await expect(heightButton).toContainText("HEIGHT 70m");
    await expect(page.getByTestId("source-status-sites")).toContainText("FORECAST");
    await expect(startButton).toHaveAttribute("aria-pressed", "false");

    // Re-open the sheet to confirm the site's own reading followed HEIGHT.
    await markers.first().click({ force: true });
    await expect(heightFact).not.toContainText("10 m AGL");

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);

    // START is the only way back - it must restore Surface + live wind together.
    await startButton.click();
    await expect(heightButton).toContainText("HEIGHT");
    await expect(heightButton).not.toContainText(/[0-9]/);
    await expect(heightFact).toContainText("10 m AGL");
    await expect(page.getByTestId("source-status-sites")).toContainText("MEASURED");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });

  test("HEIGHT never offers a value above the real 180m data ceiling", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    await page.getByTestId("height-control-button").click();
    const range = page.getByTestId("altitude-slider-range");
    await expect(range).toHaveAttribute("max", "1");
    await range.fill("1"); // the slider's own max
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("180 m AGL");
  });

  test("collapsing HEIGHT does not reset the selected altitude", async ({ page }) => {
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForTimeout(1500);

    const heightButton = page.getByTestId("height-control-button");
    await heightButton.click();
    await page.getByTestId("altitude-slider-range").fill("0.55");
    await expect(heightButton).toContainText("HEIGHT 70m");

    await heightButton.click(); // collapse
    await expect(page.getByTestId("height-control-slider")).toHaveCount(0);
    await expect(heightButton).toContainText("HEIGHT 70m"); // altitude preserved while collapsed

    await heightButton.click(); // re-expand
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("70 m AGL");
  });

  test("START also resets time, and moving time alone exits live mode", async ({ page }) => {
    await page.goto("/");
    const range = page.getByTestId("time-slider-range");
    await expect(range).not.toHaveAttribute("max", "0", { timeout: 15_000 });

    const startButton = page.getByTestId("start-button");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");

    await range.fill("6");
    await expect(page.getByTestId("time-slider-label")).not.toHaveText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("FORECAST");
    await expect(startButton).toHaveAttribute("aria-pressed", "false");

    await startButton.click();
    await expect(page.getByTestId("time-slider-label")).toHaveText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("MEASURED");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });

  test("START resets time/height/site-source but preserves Roads/Airspace/RASP map-tool preferences", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForTimeout(1500);

    // Set up: tomorrow, 120m, RASP on, Roads on, Airspace on.
    await page.getByTestId("time-slider-range").fill("24");
    await page.getByTestId("height-control-button").click();
    await page.getByTestId("altitude-slider-range").fill("0.8"); // 120m boundary (tests/unit/altitudeAxis.test.ts)
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("120 m AGL");
    await page.getByTestId("rasp-toggle").click();
    await page.getByTestId("roads-toggle").click();
    await page.getByTestId("airspace-toggle").click();
    await page.waitForTimeout(300);

    await page.getByTestId("start-button").click();

    await expect(page.getByTestId("time-slider-label")).toHaveText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("MEASURED");
    // Map-tool preferences are untouched by START (§ item 14) - only
    // forecast navigation (time/height/site-source) resets.
    await expect(page.getByTestId("rasp-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("roads-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("airspace-toggle")).toHaveAttribute("aria-pressed", "true");
  });
});
