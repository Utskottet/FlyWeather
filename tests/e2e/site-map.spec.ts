import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

/**
 * Counted from the catalogue rather than written down.
 *
 * These were hardcoded, and went stale the first time somebody added a
 * site through the editor on the live website - which is now a thing that
 * happens without anyone touching this repository by hand. A test that
 * has to be edited whenever a pilot adds a hill is a test that will be
 * wrong more often than the code it guards.
 *
 * What the assertions are actually about is the mapping: one marker per
 * located, enabled site, and the winch/soaring toggle showing the right
 * subset. Both hold at any catalogue size.
 */
const catalogue = JSON.parse(readFileSync("public/generated/sites.json", "utf-8")) as {
  sites: { enabled?: boolean; group?: string; coordinates?: { lat?: number | null; lon?: number | null } }[];
};

const located = catalogue.sites.filter(
  (s) =>
    s.enabled !== false &&
    typeof s.coordinates?.lat === "number" &&
    typeof s.coordinates?.lon === "number",
);

const WINCH_SITE_COUNT = located.filter((s) => s.group === "winch").length;
/** Every located site is shown at once now - there is no mode to filter them. */
const LOCATED_SITE_COUNT = located.length;

test.describe("Site map", () => {
  test("renders the map with one marker per located enabled site", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("site-map")).toBeVisible();
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
  });

  test("tapping a marker opens the site sheet, closing dismisses it", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);

    // force: true - with all 24 sites now located (Block 13), several
    // cluster closely enough at this zoom to visually overlap (a known,
    // deferred §16 marker-clustering gap, not something this test
    // exercises); force bypasses Playwright's overlap-interception check.
    await mapSettled(page);
    await markers.first().click({ force: true });
    const sheet = page.getByTestId("site-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("h2")).not.toBeEmpty();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible();
  });

  test("one map shows every site, ridge and winch together", async ({ page }) => {
    // They used to be two mutually exclusive sets behind a Ridge/Winch
    // toggle, so a pilot deciding where to fly saw half the options and
    // had to know which kind they wanted before the map would show it.
    // The wind decides that, not the pilot.
    await page.goto("/");
    await expect(page.locator(".rose-marker-icon")).toHaveCount(LOCATED_SITE_COUNT);
    await expect(page.locator(".site-mode-toggle")).toHaveCount(0);

    // Winch sites are among them, not behind a switch.
    expect(WINCH_SITE_COUNT).toBeGreaterThan(0);
    await expect(page.getByTestId("site-marker-klamby")).toHaveCount(1);
  });

  test("Airspace toggle adds/removes the layer without a map jump, off by default", async ({ page }) => {
    await page.goto("/");
    await page.locator(".rose-marker-icon").first().waitFor();
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

    // off by default (Block 17: opt-in reference info, not default clutter)
    await expect(page.getByTestId("airspace-toggle")).toHaveAttribute("aria-pressed", "false");
    const hasLayerBefore = await page.evaluate(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined);
    expect(hasLayerBefore).toBe(false);

    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    await page.getByTestId("airspace-toggle").click();
    await page.waitForFunction(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined);

    const viewDuring = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewDuring).toEqual(viewBefore);

    await page.getByTestId("airspace-toggle").click();
    await expect
      .poll(() => page.evaluate(() => window.__flyweatherMap!.getLayer("airspace-fill") !== undefined))
      .toBe(false);

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);
  });

  for (const width of [360, 390, 430]) {
    test(`no horizontal overflow at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("site-map")).toBeVisible();
      // MapLibre's WebGL canvas has no per-tile DOM class to wait on the
      // way Leaflet's did - wait on the "load" flag MapLibreMap exposes.
      await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await page.screenshot({ path: `test-results/site-map/mobile-${width}.png` });
    });
  }
});
