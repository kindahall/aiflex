import { expect, test } from "@playwright/test";

/**
 * Auth flow smoke tests. Each test uses a unique random email so the
 * suite is fully self-contained — no DB cleanup needed between runs
 * (the JSON DB just accumulates test users, which is fine in dev).
 */

function uniqueEmail() {
  return `test+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aiflex.local`;
}

test.describe("Authentication", () => {
  test("homepage renders the hero and a call to action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AIflex/);
    await expect(page.getByRole("link", { name: /Lancer le studio/i })).toBeVisible();
  });

  test("signup creates a new account and redirects to dashboard", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await page.goto("/login");
    await page.getByRole("button", { name: /Inscris-toi/i }).click();
    await page.getByLabel(/Nom/i).fill("Smoke Tester");
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/Mot de passe/i).fill("test1234");
    await page.getByRole("button", { name: /Créer mon compte/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // Email verification banner should be visible since the address
    // hasn't been confirmed yet.
    await expect(page.getByText(/Vérification requise/i)).toBeVisible();
  });

  test("logout returns the user to the home page", async ({ page }) => {
    const email = uniqueEmail();
    // Sign up first.
    await page.goto("/login");
    await page.getByRole("button", { name: /Inscris-toi/i }).click();
    await page.getByLabel(/Nom/i).fill("Logout Tester");
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/Mot de passe/i).fill("test1234");
    await page.getByRole("button", { name: /Créer mon compte/i }).click();
    await page.waitForURL(/\/dashboard/);
    // Open the avatar menu and log out.
    await page.locator("header").getByRole("button").last().click();
    await page.getByRole("button", { name: /Se déconnecter/i }).click();
    await expect(page).toHaveURL("/");
  });

  test("forgot password page accepts an email and shows the confirmation", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/Email/i).fill("nobody@example.com");
    await page.getByRole("button", { name: /Envoyer le lien/i }).click();
    await expect(
      page.getByText(/un lien de réinitialisation vient de partir/i)
    ).toBeVisible();
  });
});
