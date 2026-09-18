import { expect, test } from "@playwright/test";

/**
 * Desktop (the default Playwright viewport) now shows the altitude slider
 * permanently in the bottom bar (§ Startvind UX Direction); the collapsible
 * HEIGHT button is the phone arrangement, covered at a phone viewport
 * below. The behaviour being tested - altitude drives the roses, moving it
 * leaves live mode, START brings it back - is unchanged.
 */
test.describe("Altitude control + START (§ Startvind UX Direction)", () => {
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
    const altitudeLabel = page.getByTestId("altitude-slider-label");
    // Never disabled (§ FlyWeather Mobile UI Correction) - START stays
    // clickable at all times; aria-pressed conveys "you are here now".
    await expect(startButton).toBeEnabled();
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
    await expect(altitudeLabel).toHaveText("Surface");
    await expect(page.getByTestId("source-status-sites")).toContainText("CURRENT WIND");
    await expect(page.getByTestId("source-status-wind")).toContainText("FORECAST");

    await markers.first().click({ force: true });
    const heightFact = page.getByTestId("site-sheet-height");
    await expect(heightFact).toContainText("10 m AGL");
    // The site sheet is a card in the left column on desktop and sits above
    // the map - close it before reaching for the bottom bar, the same as a
    // real user would.
    await page.getByRole("button", { name: "Close" }).click();

    // f=0.25 -> 75m (§ Simplify DMI Wind v1: 0..0.5 spans 0..150m).
    await page.getByTestId("altitude-slider-range").fill("0.25");
    await expect(altitudeLabel).toHaveText("75 m AGL");
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
    await expect(altitudeLabel).toHaveText("Surface");
    await expect(heightFact).toContainText("10 m AGL");
    await expect(page.getByTestId("source-status-sites")).toContainText("CURRENT WIND");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });

  test("altitude never offers a value above the real data ceiling (§ UPPVIND recovery milestone)", async ({
    page,
  }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await markers.first().waitFor();
    await page.waitForTimeout(1500);

    const range = page.getByTestId("altitude-slider-range");
    await expect(range).toHaveAttribute("max", "1");
    await range.fill("1"); // the slider's own max
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("2000 m AGL");
  });

  test("phone: altitude is a permanent slider, always showing its own value", async ({ page }) => {
    // It used to be a collapsible HEIGHT button here. That hid the current
    // value behind a tap and gave a secondary control the visual weight of
    // a primary one, so the phone now gets the same permanent slider the
    // desktop has - just shorter, sitting alongside the timeline.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForTimeout(1500);

    await expect(page.getByTestId("height-control-button")).toHaveCount(0);

    await page.getByTestId("altitude-slider-range").fill("0.25");
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("75 m AGL");

    // Still readable without opening anything, which was the whole point.
    await expect(page.getByTestId("altitude-slider-label")).toBeVisible();
  });

  test("START also resets time, and moving time alone exits live mode", async ({ page }) => {
    await page.goto("/");
    const range = page.getByTestId("time-slider-range");
    await expect(range).not.toHaveAttribute("max", "0", { timeout: 15_000 });

    const startButton = page.getByTestId("start-button");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");

    await range.fill("6");
    await expect(page.getByTestId("time-slider-label")).not.toContainText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("FORECAST");
    await expect(startButton).toHaveAttribute("aria-pressed", "false");

    await startButton.click();
    await expect(page.getByTestId("time-slider-label")).toContainText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("CURRENT WIND");
    await expect(startButton).toHaveAttribute("aria-pressed", "true");
  });

  test("START resets time/height/site-source but preserves Airspace/RASP map-tool preferences", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForTimeout(1500);

    // Set up: tomorrow, 450m, RASP on, Airspace on.
    await page.getByTestId("time-slider-range").fill("24");
    await page.getByTestId("altitude-slider-range").fill("0.75"); // 450m segment boundary (tests/unit/altitudeAxis.test.ts)
    await expect(page.getByTestId("altitude-slider-label")).toHaveText("450 m AGL");
    await page.getByTestId("rasp-toggle").click();
    await page.getByTestId("airspace-toggle").click();
    await page.waitForTimeout(300);

    await page.getByTestId("start-button").click();

    await expect(page.getByTestId("time-slider-label")).toContainText("NOW");
    await expect(page.getByTestId("source-status-sites")).toContainText("CURRENT WIND");
    // Map-tool preferences are untouched by START (§ item 14) - only
    // forecast navigation (time/height/site-source) resets.
    await expect(page.getByTestId("rasp-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("airspace-toggle")).toHaveAttribute("aria-pressed", "true");
  });
});
