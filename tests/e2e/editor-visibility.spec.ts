import { test, expect } from "@playwright/test";
import { mapSettled } from "./mapSettled.ts";

/**
 * The editing controls are visible to everyone, and now they work for
 * everyone too.
 *
 * Startvind's site data is meant to be improved by the pilots who fly
 * these sites, and an editor nobody can see is an editor nobody
 * contributes to. Add site sits inside the header menu rather than as a
 * button of its own, which is the honest weight for it.
 *
 * What replaced the password is attribution: a save carries a name, a
 * club and two affirmations, and lands in a public log. So what these
 * tests protect is no longer "visible but locked" - it is that the
 * contributor block is actually there, and that nothing can be published
 * without it. The refusal itself lives where it is enforced:
 * tests/unit/editorWorker.test.ts.
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
  await mapSettled(page);
  await page.locator('[data-testid^="site-marker-"]').first().click({ force: true });
  await page.waitForSelector('[data-testid="site-sheet"]', { timeout: 20_000 });
  await expect(page.locator('[data-testid="site-sheet-edit"]')).toBeVisible();
});

test("the editor opens straight into the form - no password stands in the way", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  await expect(page.locator('[data-testid="site-editor"]')).toBeVisible();
  await expect(page.locator('[data-testid="editor-save"]')).toBeVisible();
  await expect(page.locator('[data-testid="editor-signin"]')).toHaveCount(0);
});

test("the editor asks who is making the change, and says where that goes", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  await expect(page.locator('[data-testid="contributor-name"]')).toBeVisible();
  await expect(page.locator('[data-testid="contributor-club"]')).toBeVisible();
  // Typed, not chosen. A dropdown asks nothing of anybody - a bot picks
  // the first option - and naming your club is the only question on this
  // form that a script cannot answer.
  await expect(page.locator('[data-testid="contributor-club"]')).toHaveJSProperty("tagName", "INPUT");
  await expect(page.locator('[data-testid="contributor-human"]')).toBeVisible();
  await expect(page.locator('[data-testid="contributor-goodfaith"]')).toBeVisible();
  // Nobody should have to guess that their name is about to be published.
  await expect(page.locator(".contributor-note")).toContainText("publikt");
});

test("neither tickbox arrives pre-ticked", async ({ page }) => {
  // They are an affirmation about THIS edit. One that arrives already
  // ticked is not an affirmation.
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  await expect(page.locator('[data-testid="contributor-human"]')).not.toBeChecked();
  await expect(page.locator('[data-testid="contributor-goodfaith"]')).not.toBeChecked();
});

test("the honeypot is hidden from people and never focusable", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  const trap = page.locator('[data-testid="contributor-trap"]');
  await expect(trap).toHaveCount(1);
  await expect(trap).not.toBeInViewport();
  await expect(trap).toHaveAttribute("tabindex", "-1");
});

test("the club is recognised as you type, and echoed back by its own name", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  await page.locator('[data-testid="contributor-club"]').fill("cps");
  await expect(page.locator('[data-testid="contributor-club-ok"]')).toContainText("Club Parapente Syd");
});

test("a club that does not exist is refused, but never as a dead end", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  await page.locator('[data-testid="contributor-name"]').fill("Anna Andersson");
  await page.locator('[data-testid="contributor-club"]').fill("Manchester United");
  await page.locator('[data-testid="editor-save"]').click();

  const problem = page.locator('[data-testid="contributor-club-problem"]');
  await expect(problem).toBeVisible();
  // A genuinely new club must not silently lose the first pilot from it.
  await expect(problem).toContainText("Hör av dig");
});

test("saving is refused until the edit is signed, and says which part is missing", async ({ page }) => {
  await page.locator('[data-testid="header-menu-toggle"]').click();
  await page.locator('[data-testid="add-site-button"]').click();

  // Nothing is marked wrong before a save is attempted - a form that turns
  // red while you are still filling it in is scolding you for not having
  // finished yet.
  await expect(page.locator('[data-testid="contributor-name-problem"]')).toHaveCount(0);

  await page.locator('[data-testid="editor-save"]').click();
  await expect(page.locator('[data-testid="contributor-name-problem"]')).toBeVisible();

  await page.locator('[data-testid="contributor-name"]').fill("Anna Andersson");
  await page.locator('[data-testid="contributor-club"]').fill("CPS");
  await page.locator('[data-testid="editor-save"]').click();
  await expect(page.locator('[data-testid="contributor-name-problem"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="contributor-club-problem"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="contributor-check-problem"]')).toBeVisible();
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
