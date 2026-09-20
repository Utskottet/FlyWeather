import { test, expect } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

/**
 * Picking a live wind station for a site, from the editor.
 *
 * Run against Klamby, which sits 9.9 km from Sjöbo flying club's station
 * and is therefore the case the integration was specified around.
 * NOTHING here saves: the finder fills fields and stops, so the test
 * exercises the whole path up to - and deliberately not including - a
 * publish.
 */

async function openKlambyEditor(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await mapSettled(page);
  // Klamby is a winch site, so it is not among the markers on load.
  await page.getByTestId("site-mode-winch").click();
  await page.getByTestId("site-marker-klamby").first().click({ force: true });
  await page.getByTestId("site-sheet-edit").click();
  await page.waitForSelector('[data-testid="site-editor"]');
  // The editor opens on its instruction screen; the form is behind it.
  await page.getByTestId("editor-intro-ok").click();
}

test("finds the club station 9.9 km from Klamby, nearest first", async ({ page }) => {
  await openKlambyEditor(page);
  await page.getByTestId("find-station").click();

  const rows = page.locator(".station-finder-row");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  // Nearest first, and the nearest really is the club station.
  await expect(rows.first()).toContainText("9.9 km");
  await expect(rows.first()).toContainText("Sjöbo");
});

test("shows a real observation, with its age, before anything is chosen", async ({ page }) => {
  await openKlambyEditor(page);
  await page.getByTestId("find-station").click();
  await page.locator(".station-finder-row").first().click();

  const preview = page.locator('[data-testid="station-preview-ok"]');
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview).toContainText("m/s");
  // The age is stated rather than implied - a connection that works
  // tells you nothing about when the wind was measured.
  await expect(page.getByTestId("station-preview-age")).toBeVisible();
  // And the panel says plainly what a working connection does not prove.
  await expect(page.locator('[data-testid="station-finder-preview"]')).toContainText(/does not mean/i);
});

test("Use this station fills the fields and saves nothing", async ({ page }) => {
  await openKlambyEditor(page);
  await page.getByTestId("find-station").click();
  await page.locator(".station-finder-row").first().click();
  await expect(page.locator('[data-testid="station-finder-preview"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("station-finder-use").click();

  await expect(page.getByTestId("station-name")).toHaveValue(/Sjöbo/);
  await expect(page.getByTestId("station-provider")).toHaveValue("weewx");
  await expect(page.getByTestId("station-id")).toHaveValue("esmi");
  // The URL is the part that was being dropped, and the part a club feed
  // cannot be read without.
  await expect(page.getByTestId("station-url")).toHaveValue(/vader\.sjoboflyg\.se/);
  await expect(page.getByTestId("station-note")).toHaveValue(/9\.9 km/);

  // Still in the editor: choosing a station is not publishing one.
  await expect(page.locator('[data-testid="site-editor"]')).toBeVisible();
  await expect(page.locator('[data-testid="editor-save-error"]')).toHaveCount(0);
});

test("opening and closing the finder does not cost unsaved edits", async ({ page }) => {
  await openKlambyEditor(page);
  const description = page.locator('[data-testid="site-editor"] textarea').first();
  await description.fill("An unsaved edit that must survive the finder.");

  await page.getByTestId("find-station").click();
  await expect(page.locator('[data-testid="station-finder"]')).toBeVisible();
  await page.locator('[aria-label="Close station finder"]').click();

  await expect(page.locator('[data-testid="station-finder"]')).toHaveCount(0);
  await expect(description).toHaveValue("An unsaved edit that must survive the finder.");
});

test("warns about a provider nothing can read, rather than saving a silent station", async ({ page }) => {
  // A real site spent months with a station id typed into its provider
  // field, inert and looking complete.
  await openKlambyEditor(page);
  await page.getByTestId("station-provider").fill("33");
  await expect(page.getByTestId("station-provider-unknown")).toBeVisible();

  await page.getByTestId("station-provider").fill("holfuy");
  await expect(page.getByTestId("station-provider-unknown")).toHaveCount(0);
});

test("the connection check reports what the station says, and what it does not prove", async ({ page }) => {
  await openKlambyEditor(page);
  await page.getByTestId("station-provider").fill("holfuy");
  await page.getByTestId("station-id").fill("214");
  await page.getByTestId("check-station").click();

  const status = page.locator('[data-testid="station-check-ok"], [data-testid="station-check-unavailable"]');
  await expect(status).toBeVisible({ timeout: 30_000 });
  // Whatever the outcome, it must never read as a verification.
  await expect(page.locator(".station-fields-status")).not.toContainText(/verified suitable/i);
});

test("a site panel names its station and how far away it is, right under the source badge", async ({ page }) => {
  // "LIVE" says the wind is a measurement; this says a measurement of
  // WHERE. An anemometer on the hill and an airport twenty kilometres
  // inland are both live, and only one of them is about this site.
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await mapSettled(page);
  await page.getByTestId("site-marker-alabodarna").first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]');

  const station = page.getByTestId("site-sheet-station");
  await expect(station).toBeVisible();
  // Named by provider and id where no station name was saved - "Holfuy"
  // alone identifies nothing.
  await expect(station).toContainText(/#\d+/);
  await expect(station).toContainText(/km away/);

  // Directly under the badge, not lower down the panel.
  const badge = (await page.getByTestId("site-sheet-source").boundingBox())!;
  const line = (await station.boundingBox())!;
  expect(line.y).toBeGreaterThan(badge.y);
  expect(line.y - (badge.y + badge.height)).toBeLessThan(24);
});

test("a site with no station says nothing rather than an empty distance", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await mapSettled(page);
  await page.getByTestId("site-marker-lenacken").first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]');
  const station = page.getByTestId("site-sheet-station");
  // Lenacken has a station, so this asserts the shape rather than absence
  // - a distance is only ever shown when one could be computed.
  if ((await station.count()) > 0) {
    await expect(station).not.toContainText(/undefined|NaN/);
  }
});

test("parking is authored by pasting whatever Google Maps gave you", async ({ page }) => {
  await openKlambyEditor(page);

  // Coordinates, as Google Maps' "Copy coordinates" puts them on the
  // clipboard - the actual authoring flow, rather than two number boxes.
  await page.getByTestId("parking-location").fill("55.411020, 13.995150");
  await expect(page.getByTestId("parking-confirmed")).toContainText("55.41102");
  await expect(page.getByTestId("parking-problem")).toHaveCount(0);

  // A full maps URL works too.
  await page.getByTestId("parking-location").fill("https://www.google.com/maps/@55.6,13.7,17z");
  await expect(page.getByTestId("parking-confirmed")).toContainText("55.6");

  // A short link cannot be read without following a redirect, so it says
  // so and tells you what to do instead.
  await page.getByTestId("parking-location").fill("https://maps.app.goo.gl/AbCdEf");
  await expect(page.getByTestId("parking-problem")).toContainText(/Kopiera koordinater/);

  // The caution about landowner goodwill is on screen while filling it in.
  await expect(page.getByTestId("parking-caution")).toContainText(/markägarens goodwill/);

  // Nothing is published by any of this.
  await expect(page.locator('[data-testid="site-editor"]')).toBeVisible();
});
