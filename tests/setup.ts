/**
 * Global test setup. Runs once before the first test file.
 *
 * Keeps the test env isolated from any real credentials accidentally present
 * in .env.local on the dev machine.
 */

// NODE_ENV is typed read-only but writable at runtime; Vitest sets it to "test"
// automatically so we don't need to do it ourselves.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.CRON_SECRET = "test-cron-secret";
// Force deterministic seeded randomness where we use it
process.env.AIFLEX_TOKEN_SECRET = "test-token-secret";
