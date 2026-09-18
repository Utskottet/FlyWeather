import { test, expect } from "@playwright/test";

/**
 * The editing controls are invisible to ordinary visitors.
 *
 * This regressed once already: the header redesign wired "Add site" to
 * PUBLISH_TARGET (does a publish target exist?) instead of ADMIN_MODE (does
 * one exist AND did this browser ask for the editor?), which put an Add
 * site button in front of every pilot on the public site. Publishing was
 * still gated by the Worker's password, so nothing could actually be
 * written - but a button nobody can use is an invitation to try, and it
 * advertises a sign-in worth guessing at.
 *
 * The two buttons are checked together on purpose: they are gated
 * separately in the code, so testing one would not have caught that.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
});

test("a plain visitor sees no Add site button", async ({ page }) => {
  await expect(page.locator('[data-testid="add-site-button"]')).toHaveCount(0);
  await expect(page.getByText("Add site", { exact: false })).toHaveCount(0);
});

test("a plain visitor sees no Edit site button on a site", async ({ page }) => {
  await page.locator('[data-testid^="site-marker-"]').first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]', { timeout: 20_000 });
  await expect(page.locator('[data-testid="site-sheet-edit"]')).toHaveCount(0);
});

test("the map itself is unaffected - a visitor still gets every site", async ({ page }) => {
  // Guards against "hide the editor" being implemented by hiding too much.
  await expect(page.locator('[data-testid^="site-marker-"]').first()).toBeVisible();
  const markers = await page.locator('[data-testid^="site-marker-"]').count();
  expect(markers).toBeGreaterThan(5);
});

test("?admin=1 brings the editor back", async ({ page }) => {
  await page.goto("/?admin=1");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await expect(page.locator('[data-testid="add-site-button"]')).toHaveCount(1);
});

test("?admin=0 turns it off again, and it stays off on a plain reload", async ({ page }) => {
  await page.goto("/?admin=1");
  await page.waitForSelector('[data-testid="add-site-button"]', { timeout: 60_000 });

  await page.goto("/?admin=0");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await expect(page.locator('[data-testid="add-site-button"]')).toHaveCount(0);

  // The flag is remembered, so "off" has to survive a reload with no query
  // string - otherwise turning it off would only last one page view.
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await expect(page.locator('[data-testid="add-site-button"]')).toHaveCount(0);
});
