import { test, expect } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

/**
 * A site's public history, at the bottom of its panel.
 *
 * Who put the site here, and what has changed since - both read straight
 * out of data/edit-log.jsonl, which the page bundles at build time.
 *
 * It deliberately says nothing at all about a site nobody has edited
 * since the log began, which is most of them. It used to lead with
 * "Underhålls av X", computed from whoever had edited most: an
 * appointment nobody had made, describing a duty nobody had agreed to,
 * that changed under their feet as soon as somebody else edited twice.
 */

async function openSite(page: import("@playwright/test").Page, id: string) {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await mapSettled(page);
  await page.getByTestId(`site-marker-${id}`).first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]');
}

test("a site added through the editor names who added it", async ({ page }) => {
  // Ven was added through the editor, so the log has an explicit add.
  await openSite(page, "ven");

  await expect(page.getByTestId("site-history")).toBeVisible();
  await expect(page.getByTestId("site-added-by")).toContainText(/Tillagd av/);
  await expect(page.getByTestId("site-log")).toBeVisible();
});

test("an older site that has been edited shows the edits but claims no author", async ({ page }) => {
  // Hovs Hallar NV pre-dates the log and has only been edited since.
  // Calling that editor its author would be a plain untruth about a
  // named person.
  await openSite(page, "hovs-hallar-nv");

  await expect(page.getByTestId("site-log")).toBeVisible();
  await expect(page.locator('[data-testid="site-added-by"]')).toHaveCount(0);
});

test("a site nobody has edited says nothing rather than showing an empty log", async ({ page }) => {
  // Hammar pre-dates the log entirely. An empty heading is worse than no
  // heading, and crediting whoever happens to edit it first would be
  // worse still.
  await openSite(page, "hammar");
  await expect(page.locator('[data-testid="site-history"]')).toHaveCount(0);
});

test("no maintainer is claimed, and nothing asks to be confirmed", async ({ page }) => {
  await openSite(page, "ven");
  await expect(page.locator('[data-testid="site-maintainer"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="site-verify"]')).toHaveCount(0);
  await expect(page.getByTestId("site-history")).not.toContainText(/Underhålls av/);
});

test("the history sits below the flying information, not above it", async ({ page }) => {
  // Somebody opening a panel wants to know whether they can fly today.
  // Who edited the wind band in March is context, not the headline.
  await openSite(page, "ven");
  const rose = await page.locator(".site-sheet-rose-row").boundingBox();
  const history = await page.locator('[data-testid="site-history"]').boundingBox();
  expect(rose).not.toBeNull();
  expect(history).not.toBeNull();
  expect(history!.y).toBeGreaterThan(rose!.y);
});
