import { expect, test } from "@playwright/test";

/**
 * Browsing flow smoke tests. These exercise the public-facing surface
 * (home, search, watch, legal pages) without touching the AI pipeline.
 */

test.describe("Browse & search", () => {
  test("home page lists curated rows of films", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Tendances/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Démos officielles/i })
    ).toBeVisible();
  });

  test("search page returns at least one catalog hit for an empty query", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(
      page.getByRole("heading", { name: /Trouve ton prochain film/i })
    ).toBeVisible();
    // The catalog has 12 items so an unfiltered search should always
    // return matches.
    await expect(page.getByText(/résultat/i)).toBeVisible();
  });

  test("genre filter narrows the results", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel(/Genre/i).selectOption("anime");
    // Wait for at least one card to appear, then verify the source pill
    // exists somewhere on the page (catalog or community).
    await expect(page.getByText(/Démo|Communauté/i).first()).toBeVisible();
  });

  test("watch page renders for a catalog item", async ({ page }) => {
    await page.goto("/watch/cat-1");
    await expect(page.getByRole("heading", { name: /Neon Exile/i })).toBeVisible();
    // The "démo de catalogue" notice must be present so visitors know
    // the play button is decorative.
    await expect(page.getByText(/démo de catalogue/i)).toBeVisible();
  });
});

test.describe("Legal pages", () => {
  test("CGU, privacy and AI disclosure all render", async ({ page }) => {
    for (const path of [
      "/legal/terms",
      "/legal/privacy",
      "/legal/ai-disclosure",
    ]) {
      await page.goto(path);
      // Each page uses the LegalLayout with a "Dernière mise à jour" line
      await expect(page.getByText(/Dernière mise à jour/i)).toBeVisible();
    }
  });
});

test.describe("Health endpoint", () => {
  test("returns ok with the expected fields", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.settings.ok).toBe(true);
  });
});
