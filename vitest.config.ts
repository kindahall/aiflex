import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for AIflex unit + integration tests.
 *
 * Two layers:
 *   - tests/unit/**       pure functions, no DB, no network (fast)
 *   - tests/integration/**  Prisma mocked via vitest-mock-extended (slower)
 *
 * E2E tests are separate and use Playwright (playwright.config.ts).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", "e2e", ".next"],
    setupFiles: ["./tests/setup.ts"],
    // Coverage is opt-in (`vitest run --coverage`) to keep day-to-day
    // runs fast. When enabled we enforce a floor on security-critical
    // libraries so a refactor can't silently drop coverage.
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/translations/**", "**/*.d.ts", "**/*.test.ts", "tests/**"],
      thresholds: {
        // Project-wide floor — deliberately conservative given the
        // breadth of routes that only have integration coverage.
        lines: 40,
        functions: 40,
        branches: 35,
        statements: 40,
        // Hard floor on security-critical modules.
        "lib/password.ts": { lines: 80, functions: 80, statements: 80 },
        "lib/tokens.ts": { lines: 80, functions: 80, statements: 80 },
        "lib/totp.ts": { lines: 80, functions: 80, statements: 80 },
        "lib/csrf.ts": { lines: 80, functions: 80, statements: 80 },
        "lib/moderation.ts": { lines: 70, functions: 70, statements: 70 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
