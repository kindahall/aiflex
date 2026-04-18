import "server-only";

/**
 * Exposes read-only snapshots of internal DB collections for the
 * recommendation engine. This avoids exposing the full cache object
 * while still giving recommendations access to the likes array.
 *
 * This module is intentionally thin — it just re-exports from server-db
 * by reaching into the same backing file through a controlled API.
 */

// We cannot import the cache directly from server-db (it's a local variable).
// Instead, we add a getter there. But to avoid modifying server-db's exports
// too much, we use a different approach: read the DB file directly.

import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export async function getLikesSnapshot(): Promise<
  Array<{ userId: string; projectId: string; createdAt: number }>
> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const data = JSON.parse(raw);
    return data.likes || [];
  } catch {
    return [];
  }
}
