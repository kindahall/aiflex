import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AIflex e2e tests.
 *
 * The dev server is auto-started before the tests run. We don't need
 * the AI providers (Anthropic, fal.ai) for the smoke tests — they only
 * exercise auth, navigation, search and the dashboard, none of which
 * touches the generation pipeline.
 *
 * Run locally:
 *   npm run e2e            (headless)
 *   npm run e2e:ui         (interactive UI)
 *
 * First-time setup:
 *   npm install --save-dev @playwright/test
 *   npx playwright install --with-deps chromium
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Surface dev server logs in CI so test failures don't have to be
    // diagnosed blind.
    stdout: "pipe",
    stderr: "pipe",
    // Tests must work without API keys — flow them through with empty
    // strings so the moderation/seedance code paths take their dev
    // fallbacks.
    env: {
      NODE_ENV: "test",
    },
  },
});
