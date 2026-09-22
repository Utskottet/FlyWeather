import { expect, test } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

/**
 * Roses must open at the size their zoom calls for.
 *
 * Reported by a pilot: "when I enter the site the roses have a size, as
 * soon as I touch zoom there is a bump in size."
 *
 * The cause was that MapLibre's "zoom" event fires on *change*, so
 * nothing ever told the app what zoom the map opened at. The marker size
 * was seeded from a hardcoded guess of zoom 10 (54 px) while the map
 * actually opens fitted to every site at about z6-7 (26 px). The roses
 * rendered at roughly double their correct size until the first pinch
 * snapped them down.
 *
 * This is checked in a real browser rather than a unit test because the
 * bug lived entirely in the gap between MapLibre's real zoom and what the
 * React tree believed - exactly the kind of disagreement jsdom cannot
 * have, since it has no map.
 */
test.describe("Rose size follows the map's real zoom", () => {
  /** The rendered width of the first rose, in CSS pixels. */
  async function firstRoseWidth(page: import("@playwright/test").Page): Promise<number> {
    const box = await page.locator(".rose-marker-icon").first().boundingBox();
    if (!box) throw new Error("no rose marker rendered");
    return box.width;
  }

  test("opens at the size its fitted zoom calls for, with no jump on first zoom", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("site-map")).toBeVisible();
    await mapSettled(page);

    const onLoad = await firstRoseWidth(page);

    // Nudge the zoom by a hair - far too little to change the size band,
    // but enough to fire the event that used to be the first time the app
    // learned the truth.
    await page.evaluate(() => {
      const map = window.__flyweatherMap;
      map?.setZoom((map?.getZoom() ?? 7) + 0.01);
    });
    await mapSettled(page);

    const afterNudge = await firstRoseWidth(page);

    // Before the fix this was 54 px against roughly 26 - a jump of about
    // double. One pixel of slack is for rounding in the size curve.
    expect(Math.abs(afterNudge - onLoad)).toBeLessThanOrEqual(1);
  });

  test("still grows when the zoom genuinely changes", async ({ page }) => {
    // The guard above must not be satisfiable by freezing the size.
    await page.goto("/");
    await expect(page.getByTestId("site-map")).toBeVisible();
    await mapSettled(page);

    const wideOut = await firstRoseWidth(page);

    await page.evaluate(() => window.__flyweatherMap?.setZoom(12));
    await mapSettled(page);

    const zoomedIn = await firstRoseWidth(page);
    expect(zoomedIn).toBeGreaterThan(wideOut);
  });
});
