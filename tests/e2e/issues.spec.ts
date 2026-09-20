import { test, expect } from "@playwright/test";

/**
 * Issues and improvements: a public list anybody can read, and a form
 * anybody can post to, under the same menu as Add site.
 *
 * The posting path writes a real file, so these tests stop at the point
 * of sending - what is exercised is that the form is reachable, refuses
 * an unsigned or empty suggestion, and says where what you write ends
 * up.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.locator('[data-testid="header-menu-toggle"]').click();
});

test("sits in the menu beside Add site", async ({ page }) => {
  await expect(page.getByTestId("issues-button")).toBeVisible();
  await expect(page.getByTestId("add-site-button")).toBeVisible();
});

test("opens a form and says the list is public", async ({ page }) => {
  await page.getByTestId("issues-button").click();

  const panel = page.getByTestId("issues-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("issue-text")).toBeVisible();
  // Public on both sides - the thing that makes a suggestion box worth
  // using is being able to see what other people already said.
  await expect(panel).toContainText(/alla kan läsa den/);
  await expect(panel).toContainText(/anyone can read it/i);
});

test("asks who is writing, with the same signature an edit needs", async ({ page }) => {
  await page.getByTestId("issues-button").click();
  await expect(page.getByTestId("contributor-name")).toBeVisible();
  await expect(page.getByTestId("contributor-club")).toBeVisible();
  await expect(page.getByTestId("contributor-affirm")).toBeVisible();
});

test("refuses an empty suggestion, and says what is missing", async ({ page }) => {
  await page.getByTestId("issues-button").click();
  await page.getByTestId("issue-submit").click();

  await expect(page.getByTestId("issue-text-problem")).toBeVisible();
  await expect(page.getByTestId("contributor-name-problem")).toBeVisible();
});

test("refuses a signed suggestion that is still empty", async ({ page }) => {
  await page.getByTestId("issues-button").click();
  await page.getByTestId("contributor-name").fill("Anna Andersson");
  await page.getByTestId("contributor-club").fill("CPS");
  await page.getByTestId("contributor-affirm").check();
  await page.getByTestId("issue-submit").click();

  await expect(page.getByTestId("issue-text-problem")).toBeVisible();
});

test("closes without sending anything", async ({ page }) => {
  await page.getByTestId("issues-button").click();
  await page.getByTestId("issue-text").fill("Something that could be better.");
  await page.locator('[data-testid="issues-panel"] [aria-label="Close"]').click();
  await expect(page.locator('[data-testid="issues-panel"]')).toHaveCount(0);
});
