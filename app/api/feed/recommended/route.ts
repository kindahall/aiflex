import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getPersonalizedFeed,
  getTrendingProjects,
} from "@/lib/recommendations";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personalized recommendation feed.
 * - Authenticated users get a personalized feed based on their likes.
 * - Anonymous users get trending projects.
 * Query params: ?limit=20
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );

    const user = await getCurrentUser();

    const projects = user
      ? await getPersonalizedFeed(user.id, limit)
      : await getTrendingProjects(limit);

    return NextResponse.json({
      projects: projects.map(sanitize),
    });
  } catch (err) {
    console.error("[feed/recommended]", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

function sanitize(p: Project & { authorName: string }) {
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
    author: p.authorName,
    previewUrl: p.scenes?.find((s) => s.videoUrl)?.videoUrl || null,
  };
}
