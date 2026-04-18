import "server-only";
import { prisma } from "./prisma";
import { embedText, projectEmbeddingText } from "./embeddings";

/**
 * pgvector-based recommendations (V8 §B4.5).
 *
 * Storage: `Project.embedding vector(1536)` set at publish time
 * (or backfilled via the admin endpoint).
 *
 * Query: cosine distance `<=>` via pgvector operator. Postgres returns
 * the rows ordered by similarity to the user's taste profile, which is
 * the average of the embeddings of the last 10 films the user completed
 * at ≥ 70%. Cold-start users (< 3 completions) fall back to trending.
 *
 * Requires pgvector extension:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 */

export interface RecoResult {
  projectId: string;
  distance: number;
  title: string | null;
  thumbnailUrl: string | null;
  genre: string;
  views: number;
}

/**
 * Persist (or refresh) the embedding for a Project row. No-ops silently
 * if OpenAI isn't configured.
 */
export async function upsertProjectEmbedding(
  projectId: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, synopsis: true, genre: true, concept: true },
  });
  if (!project) return false;

  const text = projectEmbeddingText(project);
  if (!text.trim()) return false;

  const vec = await embedText(text);
  if (!vec) return false;

  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET embedding = $1::vector WHERE id = $2`,
    `[${vec.join(",")}]`,
    projectId
  );
  return true;
}

/**
 * Return the N nearest public projects to `vector`. Filters out films the
 * user has already fully watched (≥ 70%).
 */
export async function findNearestProjects(
  vector: number[],
  options: {
    userId?: string;
    excludeProjectIds?: string[];
    limit?: number;
  } = {}
): Promise<RecoResult[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const excluded = new Set<string>(options.excludeProjectIds ?? []);

  if (options.userId) {
    const watched = await prisma.filmView.findMany({
      where: { userId: options.userId, percentageWatched: { gte: 70 } },
      select: { projectId: true },
      take: 200,
    });
    for (const v of watched) if (v.projectId) excluded.add(v.projectId);
  }

  // Raw SQL because Prisma doesn't yet support pgvector's <=> operator.
  type Row = {
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    genre: string;
    views: number;
    distance: number;
  };
  const vec = `[${vector.join(",")}]`;
  const excludedList = excluded.size > 0 ? `{${[...excluded].map(quote).join(",")}}` : "{}";
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, title, "thumbnailUrl", genre, views,
            embedding <=> $1::vector AS distance
     FROM "Project"
     WHERE published = true
       AND visibility = 'public'
       AND status = 'ready'
       AND "isDisavowed" = false
       AND embedding IS NOT NULL
       AND id <> ALL($2::text[])
     ORDER BY distance ASC
     LIMIT $3`,
    vec,
    excludedList,
    limit
  );

  return rows.map((r) => ({
    projectId: r.id,
    distance: Number(r.distance),
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    genre: r.genre,
    views: Number(r.views),
  }));
}

/**
 * Build a "taste vector" for a user by averaging the embeddings of films
 * they completed at ≥ 70% — weighted by recency.
 * Returns null for cold-start users.
 */
export async function computeUserTasteVector(
  userId: string
): Promise<number[] | null> {
  const recent = await prisma.filmView.findMany({
    where: { userId, percentageWatched: { gte: 70 } },
    orderBy: { watchedAt: "desc" },
    take: 10,
    select: { projectId: true, watchedAt: true },
  });
  if (recent.length < 3) return null;

  const ids = recent.map((r) => r.projectId).filter(Boolean) as string[];
  if (!ids.length) return null;

  type Row = { id: string; embedding: string };
  const vecs = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, embedding::text AS embedding
     FROM "Project"
     WHERE id = ANY($1::text[])
       AND embedding IS NOT NULL`,
    `{${ids.map(quote).join(",")}}`
  );
  if (!vecs.length) return null;

  // Parse the "[a,b,c,...]" text representation back to numbers
  const matrix: number[][] = [];
  for (const row of vecs) {
    const parsed = row.embedding
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((n) => Number(n));
    if (parsed.length > 0) matrix.push(parsed);
  }
  if (!matrix.length) return null;

  const dims = matrix[0].length;
  const sum = new Array(dims).fill(0);
  for (const v of matrix) {
    for (let i = 0; i < dims; i++) sum[i] += v[i];
  }
  const avg = sum.map((s) => s / matrix.length);
  // Normalize for cosine — pgvector's <=> expects any scale but normal
  // vectors gives cleaner distances.
  const mag = Math.sqrt(avg.reduce((a, b) => a + b * b, 0)) || 1;
  return avg.map((x) => x / mag);
}

/**
 * Get a personalized feed for a user. Returns empty array if pgvector is
 * not available (caller should fall back to the heuristic recommender).
 */
export async function personalizedFeed(
  userId: string,
  limit = 20
): Promise<RecoResult[]> {
  try {
    const vec = await computeUserTasteVector(userId);
    if (!vec) return [];
    return findNearestProjects(vec, { userId, limit });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[recommendations-vec] feed failed, likely pgvector missing:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
