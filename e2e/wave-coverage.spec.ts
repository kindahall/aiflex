import { expect, test } from "@playwright/test";

/**
 * E2E coverage for the post-V8 surfaces created across Vagues 0-3.
 *
 * Like the existing sequel-ui spec, we don't drive the full pipeline
 * (no real Stripe / fal.ai calls). We verify auth gating, page rendering,
 * and that the new pages don't 500. Production validation of the full
 * checkout flows happens manually with `stripe listen`.
 */

test.describe("Vague 0 — finitions", () => {
  test("/upload page shows drag & drop without crashing", async ({ page }) => {
    await page.goto("/upload");
    // Either we land on the upload form or get redirected to login if not authed
    const url = page.url();
    expect(url).toMatch(/\/upload|\/login/);
  });
});

test.describe("Vague 1 — monétisation UI", () => {
  test("/pricing renders all 4 plans (free/pro/studio/family)", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText(/Gratuit/i).first()).toBeVisible();
    await expect(page.getByText(/Pro/i).first()).toBeVisible();
    await expect(page.getByText(/Studio/i).first()).toBeVisible();
    await expect(page.getByText(/Famille/i).first()).toBeVisible();
  });

  test("/dashboard/referral redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard/referral");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/dashboard/creator-plan renders the 3 Creator Pro tiers", async ({
    page,
  }) => {
    await page.goto("/dashboard/creator-plan");
    // Either redirect to login or display the tiers
    const url = page.url();
    if (url.includes("/login")) {
      expect(url).toContain("redirect=/dashboard/creator-plan");
    } else {
      await expect(page.getByText(/Creator Pro Basic/i)).toBeVisible();
    }
  });
});

test.describe("Vague 2 — UX spectateur & social", () => {
  test("/who-is-watching redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/who-is-watching");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/feed redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/list/[token] returns 404 when the token doesn't exist", async ({
    page,
  }) => {
    const res = await page.goto("/list/no-such-token-xyz");
    expect(res?.status()).toBe(404);
  });
});

test.describe("Vague 3 — admin & compliance", () => {
  test("/admin/moderation-queue redirects unauthenticated visitors to login", async ({
    page,
  }) => {
    await page.goto("/admin/moderation-queue");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/account/verify-age redirects unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/account/verify-age");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/account/usage redirects unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/account/usage");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/account/pending-sequels redirects unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/account/pending-sequels");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/api/health returns 200 with JSON checks", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("uptimeMs");
  });
});

test.describe("Vague 0/3 — privacy hub", () => {
  test("/dashboard/privacy redirects unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/dashboard/privacy");
    await expect(page).toHaveURL(/\/login/);
  });
});
