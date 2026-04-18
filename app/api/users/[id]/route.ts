import { NextResponse } from "next/server";
import { findUserById, listPublicProjects, countCommentsForProjects } from "@/lib/server-db";
import { computeBadges } from "@/lib/badges";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public creator profile. Returns the user's name + their published films.
 * Never exposes email, role, suspension state, or any private project.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) {
    return NextResponse.json({ error: "Créateur introuvable" }, { status: 404 });
  }
  const allPublic = await listPublicProjects();
  const own = allPublic.filter((p) => p.ownerId === id);
  const totalLikes = own.reduce((n, p) => n + (p.likes || 0), 0);
  const totalViews = own.reduce((n, p) => n + (p.views || 0), 0);
  const totalScenes = own.reduce((n, p) => n + (p.scenes?.length || 0), 0);
  const totalVideos = own.reduce(
    (n, p) => n + (p.scenes?.filter((s) => s.videoUrl).length || 0),
    0
  );

  // Aggregate comment counts in a single batched query (was N+1 per project).
  const commentCounts = await countCommentsForProjects(own.map((p) => p.id));
  let totalComments = 0;
  for (const n of commentCounts.values()) totalComments += n;

  // Count remixes by scanning the already-loaded public projects (no extra query).
  const ownTitles = new Set(
    own.map((o) => o.concept?.title).filter(Boolean) as string[]
  );
  const remixCount = allPublic.filter(
    (p) =>
      p.ownerId !== id &&
      [...ownTitles].some((t) => p.idea.includes(`Remix de « ${t} »`))
  ).length;

  const badges = computeBadges({
    publishedFilms: own.length,
    totalLikes,
    totalViews,
    totalScenes,
    totalVideos,
    totalComments,
    remixCount,
  });

  return NextResponse.json({
    profile: {
      id: user.id,
      name: user.name,
      bio: user.bio || null,
      avatarSeed: user.avatarSeed || user.email,
      memberSince: user.createdAt,
      films: own.map(serializeFilm),
      badges,
      stats: {
        publishedFilms: own.length,
        totalLikes,
        totalViews,
        totalScenes,
        totalVideos,
        totalComments,
        remixCount,
      },
    },
  });
}

function serializeFilm(p: Project) {
  return {
    id: p.id,
    title: p.concept?.title || "Sans titre",
    logline: p.concept?.logline || p.idea,
    genre: p.genre,
    format: p.format,
    coverUrl: p.coverUrl || p.scenes?.[0]?.imageUrl,
    sceneCount: p.scenes?.length || 0,
    videoCount: p.scenes?.filter((s) => s.videoUrl).length || 0,
    publishedAt: p.publishedAt,
    likes: p.likes || 0,
    views: p.views || 0,
  };
}
