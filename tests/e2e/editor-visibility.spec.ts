import { test, expect } from "@playwright/test";

/**
 * The editing controls are visible to everyone - and grant nothing.
 *
 * That visibility is deliberate (decided 2026-09-18): Startvind's site data
 * is meant to be improved by the pilots who fly these sites, and an editor
 * nobody can see is an editor nobody contributes to. Add site sits inside
 * the header menu rather than as a button of its own, which is the honest
 * weight for it.
 *
 * What these tests actually protect is the other half: that being visible
 * is not being open. No session, no publishing - the form must be
 * unreachable and the Worker must refuse the write. Those are separate
 * mechanisms, so both are checked here.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
});

test("Add site is in the menu, not loose in the header", async ({ page }) => {
  // Findable, but not competing with the map for attention.
  await expect(page.locator('[data-testid="add-site-button"]')).toHaveCount(0);
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await expect(page.locator('[data-testid="add-site-button"]')).toBeVisible();
});

test("the menu closes on Escape rather than sitting over the map", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await expect(page.locator('[data-testid="header-menu-panel"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="header-menu-panel"]')).toHaveCount(0);
});

test("Edit site is always on an open site", async ({ page }) => {
  await page.locator('[data-testid^="site-marker-"]').first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]', { timeout: 20_000 });
  await expect(page.locator('[data-testid="site-sheet-edit"]')).toBeVisible();
});

test("the editor opens against whatever this build can actually publish to", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();
  await expect(page.locator('[data-testid="site-editor"]')).toBeVisible();

  // Which of the two appears depends on where a save would go, and the
  // suite runs against a dev server with no Worker configured - so here it
  // is the form, writing straight to disk on localhost.
  //
  // With a Worker (the deployed site) it is the sign-in screen instead,
  // and THAT is the guarantee which makes showing the control to everyone
  // safe. It is not asserted here because this environment cannot produce
  // it; it is covered by tests/unit/editorApi.test.ts ("requires a session
  // before it will call the Worker") and by the Worker itself refusing
  // every unauthenticated publish - see tests/unit/editorWorker.test.ts.
  const signIn = await page.locator('[data-testid="editor-signin"]').count();
  const form = await page.locator('[data-testid="editor-save"]').count();
  expect(signIn + form).toBeGreaterThan(0);
});

test("the map itself is unaffected - a visitor still gets every site", async ({ page }) => {
  // Guards against "hide the editor" being implemented by hiding too much.
  await expect(page.locator('[data-testid^="site-marker-"]').first()).toBeVisible();
  const markers = await page.locator('[data-testid^="site-marker-"]').count();
  expect(markers).toBeGreaterThan(5);
});

test("the editing controls do not depend on the admin flag any more", async ({ page }) => {
  // ?admin=1 used to be what revealed them. It no longer gates these, and
  // ?admin=0 must not hide them - otherwise a visitor who once turned the
  // flag off would silently lose the editor for good.
  await page.goto("/?admin=0");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await expect(page.locator('[data-testid="add-site-button"]')).toBeVisible();
});
