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
/** The map opens in soaring mode, so the winch strips are not among the markers on load. */
const LOCATED_SITE_COUNT = located.length - WINCH_SITE_COUNT;

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

  test("Soaring/Winch site-mode toggle switches the displayed set without a map jump", async ({ page }) => {
    await page.goto("/");
    const markers = page.locator(".rose-marker-icon");
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
    await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 10_000 });

    const viewBefore = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });

    // Winch mode shows only the winch group - one located site (Klamby)
    // today, the rest still without a verified coordinate (see
    // docs/SITE_DATA_AUDIT.md), so this checks that the displayed set
    // really changes rather than that it is empty. The empty-state notice
    // only appears when the selected group has no located site at all.
    await page.getByTestId("site-mode-winch").click();
    await expect(markers).toHaveCount(WINCH_SITE_COUNT);
    await expect(page.locator(".site-mode-empty-notice")).not.toBeVisible();

    const viewDuringWinch = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewDuringWinch).toEqual(viewBefore);

    await page.getByTestId("site-mode-soaring").click();
    await expect(markers).toHaveCount(LOCATED_SITE_COUNT);
    await expect(page.locator(".site-mode-empty-notice")).not.toBeVisible();

    const viewAfter = await page.evaluate(() => {
      const m = window.__flyweatherMap!;
      return { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing() };
    });
    expect(viewAfter).toEqual(viewBefore);
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
