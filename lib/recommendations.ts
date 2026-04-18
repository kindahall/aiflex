import "server-only";
import {
  listPublicProjects,
  findUserById,
  getProjectById,
  countCommentsForProject,
} from "./server-db";
import { getLikesSnapshot } from "./server-db-internals";
import type { Project } from "./types";

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0..1 decay over `windowDays`. Items older than the window score 0. */
function recencyScore(
  timestampMs: number,
  windowDays: number
): number {
  const ageMs = Date.now() - timestampMs;
  if (ageMs < 0) return 1;
  if (ageMs > windowDays * DAY_MS) return 0;
  return 1 - ageMs / (windowDays * DAY_MS);
}

/** Enrich a project with its author name for feed display. */
async function enrichWithAuthor(
  p: Project
): Promise<Project & { authorName: string }> {
  const owner = await findUserById(p.ownerId);
  return {
    ...p,
    authorName: owner?.name || p.author || "Createur AIflex",
  };
}

// ---------------------------------------------------------------------------
// 1. Personalized feed
// ---------------------------------------------------------------------------

export async function getPersonalizedFeed(
  userId: string,
  limit = 20
): Promise<Array<Project & { authorName: string }>> {
  const allProjects = await listPublicProjects();
  const likes = await getLikesSnapshot();

  // User's liked project IDs.
  const userLikedIds = new Set(
    likes.filter((l) => l.userId === userId).map((l) => l.projectId)
  );

  if (userLikedIds.size === 0) {
    // No likes yet — fall back to trending.
    return getTrendingProjects(limit);
  }

  // Extract genre preferences from liked projects.
  const genreCounts = new Map<string, number>();
  for (const p of allProjects) {
    if (userLikedIds.has(p.id)) {
      genreCounts.set(p.genre, (genreCounts.get(p.genre) || 0) + 1);
    }
  }

  // Find users with similar taste (collaborative filtering).
  const similarUserIds = new Set<string>();
  for (const l of likes) {
    if (l.userId !== userId && userLikedIds.has(l.projectId)) {
      similarUserIds.add(l.userId);
    }
  }

  // Projects liked by similar users (collaborative signal).
  const collaborativeLikes = new Map<string, number>();
  for (const l of likes) {
    if (similarUserIds.has(l.userId)) {
      collaborativeLikes.set(
        l.projectId,
        (collaborativeLikes.get(l.projectId) || 0) + 1
      );
    }
  }

  // Compute max popularity for normalization.
  let maxPopularity = 1;
  for (const p of allProjects) {
    const pop = (p.likes || 0) + (p.views || 0) * 0.1;
    if (pop > maxPopularity) maxPopularity = pop;
  }

  // Score each project.
  const candidates = allProjects.filter((p) => !userLikedIds.has(p.id));
  const scored = candidates.map((p) => {
    const genreMatch = genreCounts.has(p.genre)
      ? (genreCounts.get(p.genre) || 0) /
        Math.max(1, userLikedIds.size)
      : 0;
    const collabScore =
      (collaborativeLikes.get(p.id) || 0) /
      Math.max(1, similarUserIds.size);
    const recency = recencyScore(
      p.publishedAt || p.updatedAt,
      30
    );
    const popularity =
      ((p.likes || 0) + (p.views || 0) * 0.1) / maxPopularity;

    const score =
      genreMatch * 3 +
      collabScore * 2 +
      recency +
      popularity;

    return { project: p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map((s) => s.project);
  return Promise.all(top.map(enrichWithAuthor));
}

// ---------------------------------------------------------------------------
// 2. Trending projects
// ---------------------------------------------------------------------------

export async function getTrendingProjects(
  limit = 20,
  timeWindowDays = 7
): Promise<Array<Project & { authorName: string }>> {
  const allProjects = await listPublicProjects();

  const scored = await Promise.all(
    allProjects.map(async (p) => {
      const commentCount = await countCommentsForProject(p.id);
      const rawScore =
        (p.likes || 0) * 3 + (p.views || 0) + commentCount * 2;
      const decay = recencyScore(
        p.publishedAt || p.updatedAt,
        timeWindowDays
      );
      // Even older projects get some score, but boosted if recent.
      const score = rawScore * (0.3 + 0.7 * decay);
      return { project: p, score };
    })
  );

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map((s) => s.project);
  return Promise.all(top.map(enrichWithAuthor));
}

// ---------------------------------------------------------------------------
// 3. Similar projects
// ---------------------------------------------------------------------------

export async function getSimilarProjects(
  projectId: string,
  limit = 6
): Promise<Array<Project & { authorName: string }>> {
  const source = await getProjectById(projectId);
  if (!source) return [];

  const allProjects = await listPublicProjects();
  const likes = await getLikesSnapshot();

  // Users who liked the source project.
  const sourceLikers = new Set(
    likes.filter((l) => l.projectId === projectId).map((l) => l.userId)
  );

  // Projects liked by those same users.
  const coLiked = new Map<string, number>();
  for (const l of likes) {
    if (sourceLikers.has(l.userId) && l.projectId !== projectId) {
      coLiked.set(l.projectId, (coLiked.get(l.projectId) || 0) + 1);
    }
  }

  const candidates = allProjects.filter((p) => p.id !== projectId);

  const scored = candidates.map((p) => {
    let score = 0;

    // Genre match.
    if (p.genre === source.genre) score += 3;
    // Tone match.
    if (p.tone === source.tone) score += 1.5;
    // Format match.
    if (p.format === source.format) score += 1;
    // Same creator boost.
    if (p.ownerId === source.ownerId) score += 2;
    // Collaborative: liked by same users.
    const coLikeCount = coLiked.get(p.id) || 0;
    score += Math.min(3, coLikeCount * 0.5);

    return { project: p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map((s) => s.project);
  return Promise.all(top.map(enrichWithAuthor));
}
