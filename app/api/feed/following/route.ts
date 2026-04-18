import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  findUserById,
  listFollowing,
  listVisibleProjects,
} from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/feed/following
 * Returns projects from users the current user follows, sorted newest first.
 * Requires authentication.
 */
export async function GET() {
  try {
    const me = await requireUser();
    const followedUsers = await listFollowing(me.id);

    // Gather visible projects from each followed user.
    const allProjects: Array<Project & { authorName: string }> = [];
    for (const followed of followedUsers) {
      const projects = await listVisibleProjects(followed.id, me.id);
      for (const p of projects) {
        allProjects.push({ ...p, authorName: followed.name });
      }
    }

    // Sort by most recent first.
    allProjects.sort(
      (a, b) =>
        (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt)
    );

    return NextResponse.json({
      projects: allProjects.map((p) => sanitize(p, p.authorName)),
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function sanitize(p: Project, authorName: string) {
  return {
    id: p.id,
    title: p.concept?.title || "Sans titre",
    logline: p.concept?.logline || p.idea,
    synopsis: p.concept?.synopsis || "",
    genre: p.genre,
    format: p.format,
    tone: p.tone,
    coverUrl: p.coverUrl || p.scenes?.[0]?.imageUrl,
    backdropUrl: p.scenes?.[0]?.imageUrl,
    sceneCount: p.scenes?.length || 0,
    videoCount: p.scenes?.filter((s) => s.videoUrl).length || 0,
    publishedAt: p.publishedAt,
    views: p.views || 0,
    likes: p.likes || 0,
    author: authorName,
    previewUrl: p.scenes?.find((s) => s.videoUrl)?.videoUrl || null,
  };
}
