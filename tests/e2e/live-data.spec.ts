import { expect, test } from "@playwright/test";

test.describe("Live data at NOW", () => {
  test("shows a LIVE badge at NOW for a site with a working live source, switches to FORECAST off NOW", async ({
    page,
  }) => {
    await page.goto("/");
    // hammar has a configured (and currently working, per
    // docs/DATA_SOURCE_AUDIT.md) Holfuy source. Targeted by its own stable
    // testid rather than marker position/order - the generated catalogue's
    // site order is just alphabetical by sites/**/*.yaml path (§ FlyWeather
    // Site Catalogue Migration), not meaningful, and shouldn't be a test
    // dependency.
    const hammarMarker = page.getByTestId("site-marker-hammar");
    await hammarMarker.first().waitFor();
    await page.waitForTimeout(1500); // let both forecast + live fetches settle
    // force: true - with all sites located, some cluster closely enough to
    // visually overlap at this zoom (known, deferred §16 gap, not
    // exercised by this test).
    await hammarMarker.first().click({ force: true });

    const badge = page.getByTestId("site-sheet-source");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("LIVE");
    await expect(badge).toContainText("Holfuy");

    // The verdict headline ("BAD at lör 07:00") is gone - the rose says it
    // in colour, the slider says the time, and the reasons list says it in
    // words. What is checked instead is that the reasons are actually
    // there, since they are now the only wording of the verdict.
    await expect(page.locator(".site-sheet-reasons li").first()).toBeVisible();

    await page.getByTestId("time-slider-range").fill("24");
    await expect(badge).toContainText("FORECAST");
    await expect(badge).toContainText("Open-Meteo");
    // And the badge names the height it is actually quoting, rather than
    // always claiming surface wind.
    await expect(badge).toContainText("10 m surface wind");
  });
});
