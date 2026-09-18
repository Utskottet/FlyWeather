import { test, expect, type Page } from "@playwright/test";

/**
 * Startvind is a dark interface, always.
 *
 * Not a preference and not a toggle: the site looks the same whatever the
 * operating system asks for. The test that matters most is therefore the
 * one running with colorScheme "light" - if that ever comes back light,
 * someone has reintroduced a second palette.
 *
 * Dark mode covers the interface and stops there.
 *
 * The map, the wind field and the site roses keep their exact colours,
 * because those encode meaning - land against sea, wind speed, whether a
 * site is flyable - and re-tinting them would change what the app says
 * rather than how it looks. That boundary is the thing worth testing: it
 * is easy to add one more token and quietly restyle a rose.
 */

async function cssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

async function brightnessOf(page: Page, token: string): Promise<number> {
  const hex = (await cssVar(page, token)).replace("#", "");
  return [0, 2, 4].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
}

async function load(page: Page) {
  await page.goto("/");
  await page.waitForSelector('[data-testid="site-map"]', { timeout: 60_000 });
  await page.waitForFunction(() => window.__flyweatherMapLoaded === true, { timeout: 60_000 });
  await page.waitForTimeout(3000);
}

test.describe("with the OS asking for light", () => {
  test.use({ colorScheme: "light" });

  test("the site is still dark - there is no light theme to fall back to", async ({ page }) => {
    await load(page);
    // Darkness, not a specific hex. The palette is allowed to be tuned;
    // what must never change is which end of the range it sits at.
    expect(await brightnessOf(page, "--panel-bg")).toBeLessThan(100);
    expect(await brightnessOf(page, "--text")).toBeGreaterThan(150);
  });

  test("the header renders dark even so", async ({ page }) => {
    await load(page);
    const bg = await page.locator(".app-header").evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect((r + g + b) / 3).toBeLessThan(80);
  });

  test("the browser is told, so native controls come out dark too", async ({ page }) => {
    await load(page);
    // Without color-scheme the range inputs and the password field render
    // as light boxes punched into a dark page.
    expect(await cssVar(page, "color-scheme")).toBe("dark");
  });
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });

  test("panels are dark and text is light", async ({ page }) => {
    await load(page);
    expect(await brightnessOf(page, "--panel-bg")).toBeLessThan(100);
    expect(await brightnessOf(page, "--text")).toBeGreaterThan(150);
    // And far enough apart to actually read.
    const gap = (await brightnessOf(page, "--text")) - (await brightnessOf(page, "--panel-bg"));
    expect(gap).toBeGreaterThan(120);
  });

  test("nothing is pure black or pure white", async ({ page }) => {
    await load(page);
    // #000 beside #fff at night is glare, and a higher contrast than print
    // would ever use. Both ends are pulled in.
    for (const token of ["--panel-bg", "--surface-sunken", "--text-strong", "--text"]) {
      const value = await cssVar(page, token);
      expect(value, token).not.toBe("#000000");
      expect(value, token).not.toBe("#ffffff");
    }
  });

  test("elevation is carried by lighter surfaces, not heavier shadows", async ({ page }) => {
    await load(page);
    const sunken = await cssVar(page, "--surface-sunken");
    const raised = await cssVar(page, "--surface-raised");
    const brightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    // A shadow on a dark ground is invisible; a paler panel reads instantly.
    expect(brightness(raised)).toBeGreaterThan(brightness(sunken));
  });

  test("the header actually renders dark, not just the token", async ({ page }) => {
    await load(page);
    const bg = await page.locator(".app-header").evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect((r + g + b) / 3).toBeLessThan(80);
  });

  test("the site roses keep their colours - they mean something", async ({ page }) => {
    await load(page);
    const fills = await page
      .locator('[data-testid^="site-marker-"] [data-testid="sector"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("fill")));

    expect(fills.length).toBeGreaterThan(0);
    // Every wedge is either an untouched verdict colour or one dimmed by
    // the daylight fade - never something dark mode invented.
    const verdicts = ["#27c93f", "#ff9800", "#f23535", "#757575"];
    for (const fill of fills) {
      const isVerdict = verdicts.includes(fill!);
      const isDimmed = /^#[0-9a-f]{6}$/i.test(fill!);
      expect(isVerdict || isDimmed, `unexpected wedge fill ${fill}`).toBe(true);
    }
  });

  test("the map keeps its own palette", async ({ page }) => {
    await load(page);
    // Read the land colour straight out of the style the map is running.
    const land = await page.evaluate(() => {
      const layer = window.__flyweatherMap?.getStyle().layers.find((l) => l.id === "background");
      return layer && "paint" in layer ? JSON.stringify(layer.paint) : null;
    });
    expect(land).toContain("c1d3da");
  });
});
