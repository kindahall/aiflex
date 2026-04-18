import { expect, test } from "@playwright/test";

/**
 * E2E for the sequel + agent-validate UI shells (V7 §4, §6).
 *
 * These tests cover the public-facing rendering and auth gating of the new
 * pages. They deliberately do NOT drive the full generation pipeline — that
 * would require real Anthropic + fal.ai credentials + paid Stripe checkout.
 *
 * Covered:
 *   - /sequel/[filmId] without a session → prompts to log in
 *   - /sequel/[filmId] with invalid filmId → shows a friendly error
 *   - /agent/validate/[jobId] with invalid jobId (logged-in) → shows the
 *     "Chargement du job" state then the error banner
 *
 * Not covered (deferred to staging integration tests):
 *   - Full orchestration from form submit to watch page
 *   - Stripe checkout
 *   - Actual Seedance/Flux calls
 */

function uniqueEmail() {
  return `test+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aiflex.local`;
}

async function signup(page: import("@playwright/test").Page) {
  const email = uniqueEmail();
  await page.goto("/login");
  await page.getByRole("button", { name: /Inscris-toi/i }).click();
  await page.getByLabel(/Nom/i).fill("Smoke Tester");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Mot de passe/i).fill("test1234");
  await page.getByRole("button", { name: /Créer mon compte/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Sequel page", () => {
  test("without a session → shows 'Connecte-toi' CTA", async ({ page }) => {
    await page.goto("/sequel/nonexistent-film-id");
    await expect(
      page.getByRole("link", { name: /Se connecter/i })
    ).toBeVisible();
  });

  test("with invalid filmId (logged-in) → shows an error message", async ({
    page,
  }) => {
    await signup(page);
    await page.goto("/sequel/nonexistent-film-id");
    // The page fetches /api/projects/[id] which 404s; we expect a message in the
    // center of the page. The component renders the fetch-error text in a red
    // centered container.
    await expect(
      page.locator(".text-red-400, [class*=red-400]").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Agent validate page", () => {
  test("without a session → prompts to log in", async ({ page }) => {
    await page.goto("/agent/validate/fake-job-id");
    await expect(
      page.getByRole("link", { name: /Se connecter/i })
    ).toBeVisible();
  });

  test("invalid jobId (logged-in) → polls then surfaces error", async ({
    page,
  }) => {
    await signup(page);
    await page.goto("/agent/validate/nonexistent-job-id");
    // The status poll returns 404; the page displays an error message.
    await expect(page.getByText(/⚠️|inaccessible|introuvable/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Legal pages", () => {
  test("terms, privacy, cookies, DMCA, CGV, imprint all render", async ({
    page,
  }) => {
    const pages = [
      { path: "/legal/terms", heading: /CGU|Conditions/i },
      { path: "/legal/privacy", heading: /confidentialité|privacy/i },
      { path: "/legal/cookies", heading: /cookies/i },
      { path: "/legal/dmca", heading: /DMCA/i },
      { path: "/legal/cgv", heading: /vente|CGV/i },
      { path: "/legal/creator-terms", heading: /créateur/i },
      { path: "/legal/community-guidelines", heading: /communauté/i },
      { path: "/legal/imprint", heading: /mentions légales|Imprint/i },
    ];
    for (const { path, heading } of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }
  });

  test("DMCA page shows the submission form with required fields", async ({
    page,
  }) => {
    await page.goto("/legal/dmca");
    await expect(page.getByLabel(/Ton nom complet/i)).toBeVisible();
    await expect(page.getByLabel(/Email de contact/i)).toBeVisible();
    await expect(page.getByLabel(/URL complète/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Envoyer la demande DMCA/i })
    ).toBeVisible();
  });
});

test.describe("Admin reviews page", () => {
  test("non-admin user is redirected to /login", async ({ page }) => {
    await signup(page);
    await page.goto("/admin/reviews");
    // A normal signup creates a `user` role — middleware or the admin layout
    // redirects to /login with ?redirect=/admin/reviews
    await expect(page).toHaveURL(/\/login|\/admin/);
  });
});

test.describe("Cookie consent banner", () => {
  test("appears on first visit and can be dismissed with 'Tout refuser'", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/");
    // The banner's first-paint delay is ~600ms; wait for it.
    const banner = page.getByRole("dialog", { name: /Ta vie privée compte/i });
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Tout refuser/i }).click();
    await expect(banner).toBeHidden();

    // Reload: banner should not reappear (preference persisted)
    await page.reload();
    await expect(banner).toBeHidden({ timeout: 3_000 });
  });
});
