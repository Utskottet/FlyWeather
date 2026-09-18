import { test, expect, type Browser } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Live acceptance test: the deployed website publishing to the real
 * repository, with no local server involved.
 *
 * Skipped unless a password is available, so the normal suite never needs
 * it and it can never fail for people who do not have one. Supply it
 * either as STARTVIND_ADMIN_PASSWORD in the environment, or in a
 * .env.acceptance file at the repo root (already covered by .gitignore's
 * `.env.*` rule - it must never be committed):
 *
 *   ADMIN_PASSWORD=...
 *
 * The site it creates is deleted again at the end, through the GitHub API,
 * so a passing run leaves the catalogue exactly as it found it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function readPassword(): string | null {
  if (process.env.STARTVIND_ADMIN_PASSWORD) return process.env.STARTVIND_ADMIN_PASSWORD;
  const file = resolve(repoRoot, ".env.acceptance");
  if (!existsSync(file)) return null;
  const match = /^ADMIN_PASSWORD=(.*)$/m.exec(readFileSync(file, "utf-8"));
  return match ? match[1].trim() : null;
}

const LIVE = process.env.STARTVIND_LIVE_URL ?? "https://utskottet.github.io/FlyWeather/";
const PASSWORD = readPassword();
const SITE_NAME = "Acceptance Probe";
const SITE_ID = "acceptance-probe";
const SITE_PATH = `sites/se/skane/ridge/${SITE_ID}.yaml`;

test.describe("live publishing", () => {
  test.skip(PASSWORD === null, "No ADMIN_PASSWORD available - see the comment at the top of this file.");
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  async function signedInEditor(browser: Browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${LIVE}?admin=1`);
    await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await page.locator('[data-testid="add-site-button"]').click();
    await page.locator('[data-testid="editor-password"]').fill(PASSWORD!);
    await page.locator('[data-testid="editor-signin-submit"]').click();
    await expect(page.locator('[data-testid="editor-save"]')).toBeVisible({ timeout: 30_000 });
    return { context, page };
  }

  test("create, publish, and see it from a second browser with no local server", async ({ browser }) => {
    const { context, page } = await signedInEditor(browser);

    await page.locator(".site-editor-body input").first().fill(SITE_NAME);
    await page.locator(".site-editor-body textarea").first().fill("Temporary site created by the acceptance test.");
    await page.locator('[data-testid="editor-signature"]').fill("Edvin Buregren");
    await expect(page.locator(".site-editor-path")).toContainText(`${SITE_ID}.yaml`);

    await page.locator('[data-testid="editor-save"]').click();

    // Step one: committed. This is the point after which the work is safe.
    await expect(page.locator('[data-testid="publish-progress"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid="publish-progress"]')).toContainText("Saved to GitHub");

    // Step two: deployed. Reported from the workflow run for that commit,
    // so this is the real thing going live, not a timer.
    await expect(page.locator('[data-testid="publish-progress"]')).toHaveAttribute("data-state", "published", {
      timeout: 240_000,
    });
    await context.close();

    // A completely separate browser context - no session, no storage, no
    // local server - must see the new site.
    const fresh = await browser.newContext();
    const visitor = await fresh.newPage();
    await visitor.goto(`${LIVE}?cb=${Date.now()}`);
    await visitor.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await expect(visitor.locator(`[data-testid="site-marker-${SITE_ID}"]`)).toHaveCount(1, { timeout: 60_000 });
    await fresh.close();
  });

  test("edit the same site and see the change from a second browser", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${LIVE}?admin=1&cb=${Date.now()}`);
    await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });

    await page.locator(`[data-testid="site-marker-${SITE_ID}"]`).click({ force: true });
    await page.locator('[data-testid="site-sheet-edit"]').click();
    await page.locator('[data-testid="editor-password"]').fill(PASSWORD!);
    await page.locator('[data-testid="editor-signin-submit"]').click();
    await expect(page.locator('[data-testid="editor-save"]')).toBeVisible({ timeout: 30_000 });

    const edited = "Edited by the acceptance test.";
    await page.locator(".site-editor-body textarea").first().fill(edited);
    await page.locator('[data-testid="editor-signature"]').fill("Edvin Buregren");
    await page.locator('[data-testid="editor-save"]').click();

    await expect(page.locator('[data-testid="publish-progress"]')).toHaveAttribute("data-state", "published", {
      timeout: 240_000,
    });
    await context.close();

    const fresh = await browser.newContext();
    const visitor = await fresh.newPage();
    await visitor.goto(`${LIVE}?cb=${Date.now()}`);
    await visitor.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
    await visitor.locator(`[data-testid="site-marker-${SITE_ID}"]`).click({ force: true });
    await expect(visitor.locator('[data-testid="site-sheet"]')).toContainText(edited, { timeout: 30_000 });
    await fresh.close();
  });

  test("cleanup: remove the probe site from the repository", async () => {
    const token = process.env.GITHUB_TOKEN;
    test.skip(!token, "No GITHUB_TOKEN for cleanup - delete sites/se/skane/ridge/acceptance-probe.yaml by hand.");

    const api = `https://api.github.com/repos/Utskottet/FlyWeather/contents/${SITE_PATH}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    const current = await fetch(api, { headers });
    if (current.status === 404) return;
    const { sha } = (await current.json()) as { sha: string };

    const deleted = await fetch(api, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Remove acceptance-test probe site", sha }),
    });
    expect(deleted.ok).toBe(true);
  });
});
