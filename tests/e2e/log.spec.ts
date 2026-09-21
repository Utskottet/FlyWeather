import { test, expect } from "@playwright/test";

/**
 * Log: what has been going on here, and how much of it.
 *
 * Every number is counted from the log itself rather than stored, so
 * there is no total that can drift away from the lines that are its
 * evidence.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.locator('[data-testid="header-menu-toggle"]').click();
});

test("sits in the menu under Issues and improvements", async ({ page }) => {
  const items = page.locator(".app-header-menu-item");
  await expect(items.filter({ hasText: "Log" })).toBeVisible();

  const issues = (await page.getByTestId("issues-button").boundingBox())!;
  const log = (await page.getByTestId("log-button").boundingBox())!;
  expect(log.y).toBeGreaterThan(issues.y);
});

test("shows the counts, and the activity behind them", async ({ page }) => {
  await page.getByTestId("log-button").click();

  await expect(page.getByTestId("log-panel")).toBeVisible();
  const totals = page.getByTestId("log-totals");
  await expect(totals).toContainText(/Platser/);
  await expect(totals).toContainText(/Ändringar/);
  await expect(totals).toContainText(/Bidragsgivare/);
  await expect(page.getByTestId("log-list")).toBeVisible();
});

test("the site count matches the markers actually on the map", async ({ page }) => {
  // A number counted from the same data the map draws from cannot
  // disagree with it.
  await page.keyboard.press("Escape");
  const markers = await page.locator(".rose-marker-icon").count();

  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.getByTestId("log-button").click();
  await expect(page.getByTestId("log-totals")).toContainText(String(markers));
});

test("is available without an editor - reading the log needs nothing", async ({ page }) => {
  // Unlike Add site and Issues, which need somewhere for a write to go.
  await expect(page.getByTestId("log-button")).toBeVisible();
});

test("closes and leaves the map alone", async ({ page }) => {
  await page.getByTestId("log-button").click();
  await page.locator('[data-testid="log-panel"] [aria-label="Close"]').click();
  await expect(page.locator('[data-testid="log-panel"]')).toHaveCount(0);
  await expect(page.getByTestId("site-map")).toBeVisible();
});
