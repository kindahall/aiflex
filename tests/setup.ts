/**
 * Global test setup. Runs once before the first test file.
 *
 * Keeps the test env isolated from any real credentials accidentally present
 * in .env.local on the dev machine.
 */

// Hard guard: refuse to run if the inherited DATABASE_URL points at a
// real Postgres host. A typo on the wrong shell can otherwise wipe a
// staging or prod DB through the JSON-DB seed code or a Prisma test.
const inheritedDb = process.env.DATABASE_URL || "";
const looksLocal =
  !inheritedDb ||
  inheritedDb.includes("localhost") ||
  inheritedDb.includes("127.0.0.1") ||
  inheritedDb.includes("::1") ||
  inheritedDb.includes("test:test");
if (!looksLocal && process.env.AIFLEX_ALLOW_REMOTE_TEST_DB !== "1") {
  throw new Error(
    `[tests/setup] DATABASE_URL points at a non-local host (${inheritedDb.replace(
      /\/\/.*@/,
      "//***@"
    )}). Refusing to run tests against a remote DB. Override with AIFLEX_ALLOW_REMOTE_TEST_DB=1.`
  );
}

// Same idea for the file-backed JSON DB: tests must NEVER write to the
// developer's real .data/db.json. Force a tmp dir.
if (!process.env.AIFLEX_DATA_DIR) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiflex-tests-"));
  process.env.AIFLEX_DATA_DIR = dir;
}

// NODE_ENV is typed read-only but writable at runtime; Vitest sets it to "test"
// automatically so we don't need to do it ourselves.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.CRON_SECRET = "test-cron-secret";
// 32+ chars to satisfy the post-audit token-secret length validator.
process.env.AIFLEX_TOKEN_SECRET = "test-token-secret-32-chars-minimum-long-enough";
