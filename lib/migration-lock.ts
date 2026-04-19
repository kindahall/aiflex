import "server-only";

/**
 * Distributed migration lock backed by Postgres advisory locks. Use this
 * to wrap any operation that must NOT run concurrently across multiple
 * deployment instances (Prisma migrate deploy, schema patches, full
 * data backfills, etc.).
 *
 * Postgres advisory locks are session-scoped and free with the
 * connection — they cost nothing and disappear automatically if the
 * holder dies.
 *
 * Usage:
 *   await withMigrationLock("prisma-migrate", async () => {
 *     await runMigrations();
 *   });
 */

import { prisma } from "./prisma";

function lockKey(name: string): bigint {
  // Hash to a 64-bit signed int. Postgres advisory locks accept either
  // (bigint) or (int, int). We use the bigint form.
  let h = 0n;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31n + BigInt(name.charCodeAt(i))) & ((1n << 63n) - 1n);
  }
  return h;
}

export async function withMigrationLock<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { waitMs?: number; pollMs?: number } = {}
): Promise<T> {
  const key = lockKey(name);
  const waitMs = opts.waitMs ?? 5 * 60 * 1000;
  const pollMs = opts.pollMs ?? 500;
  const deadline = Date.now() + waitMs;

  while (true) {
    const rows = await prisma.$queryRawUnsafe<{ pg_try_advisory_lock: boolean }[]>(
      "SELECT pg_try_advisory_lock($1) as pg_try_advisory_lock",
      key.toString()
    );
    if (rows[0]?.pg_try_advisory_lock) break;
    if (Date.now() > deadline) {
      throw new Error(
        `Impossible d'obtenir le lock de migration "${name}" après ${waitMs}ms — un autre process le détient toujours.`
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  try {
    return await fn();
  } finally {
    await prisma.$queryRawUnsafe("SELECT pg_advisory_unlock($1)", key.toString());
  }
}
