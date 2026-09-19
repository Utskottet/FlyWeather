import type { Page } from "@playwright/test";

/**
 * Waits until the map has stopped moving.
 *
 * Markers exist well before the map has finished flying to its fitted
 * bounds, so a click that only waits for them races the camera: the
 * element is found, the map eases a little further, and the click lands
 * on a marker that has just left the viewport. That produced an
 * "Element is outside of the viewport" failure that came and went with
 * how fast the tiles happened to load.
 *
 * Asserting the marker is in view first is not enough either - it can be
 * in view when asserted and gone a frame later. The only thing that
 * actually settles it is the camera being still, which is what this
 * waits for.
 */
export async function mapSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const map = window.__flyweatherMap;
      // isMoving() already covers easing, panning and zooming; isZooming()
      // is kept because a zoom that has begun but not yet started moving
      // is still a camera about to shift under a click.
      return map !== undefined && !map.isMoving() && !map.isZooming();
    },
    { timeout: 30_000 },
  );
}
