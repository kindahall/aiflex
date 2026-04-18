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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
