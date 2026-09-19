import { test, expect } from "@playwright/test";

/**
 * A site's public history, at the bottom of its panel.
 *
 * Two questions a YAML file cannot answer on its own: who has been
 * looking after this site, and when did anybody last confirm the numbers
 * are still right. Both are derived from data/edit-log.jsonl, which the
 * page bundles at build time.
 *
 * The log is empty in this repository until the first edit lands through
 * the Worker, so these tests check the section is present and honest
 * about having nothing to show - not that it lists particular entries,
 * which would make the suite depend on live contribution history.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  await expect(page.locator('[data-testid^="site-marker-"]').first()).toBeInViewport();
  await page.locator('[data-testid^="site-marker-"]').first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]', { timeout: 20_000 });
});

test("every site panel carries its history", async ({ page }) => {
  await expect(page.locator('[data-testid="site-history"]')).toBeVisible();
  await expect(page.locator('[data-testid="site-maintainer"]')).toBeVisible();
  await expect(page.locator('[data-testid="site-last-verified"]')).toBeVisible();
});

test("says plainly when nobody has confirmed the data, rather than implying somebody has", async ({ page }) => {
  // Data checked last Sunday and data nobody has looked at since 2023
  // look identical in a file. Silence here would read as the former.
  const verified = page.locator('[data-testid="site-last-verified"]');
  await expect(verified).toContainText(/bekräftad|bekräftats/);
});

test("the history sits below the flying information, not above it", async ({ page }) => {
  // Somebody opening a panel wants to know whether they can fly today.
  // Who edited the wind band in March is context, not the headline.
  const rose = await page.locator(".site-sheet-rose-row").boundingBox();
  const history = await page.locator('[data-testid="site-history"]').boundingBox();
  expect(rose).not.toBeNull();
  expect(history).not.toBeNull();
  expect(history!.y).toBeGreaterThan(rose!.y);
});

test("the confirm button is offered only where a confirmation could actually be recorded", async ({ page }) => {
  // This suite runs against a dev server with no Worker configured, and
  // there is no log to append to there. A button that silently does
  // nothing would be worse than no button, so it is simply absent.
  await expect(page.locator('[data-testid="site-verify"]')).toHaveCount(0);
});
