import { NextResponse } from "next/server";
import { getSimilarProjects } from "@/lib/recommendations";
import { getProjectById } from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns projects similar to the given one, using the hybrid
 * recommendation algorithm (genre/tone/format matching + collaborative).
 * Query params: ?limit=6
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await getProjectById(id);
    if (!project || !project.published || project.visibility !== "public") {
      return NextResponse.json(
        { error: "Projet introuvable" },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(
      20,
      Math.max(1, Number(url.searchParams.get("limit")) || 6)
    );

    const similar = await getSimilarProjects(id, limit);

    return NextResponse.json({
      projects: similar.map(sanitize),
    });
  } catch (err) {
    console.error("[projects/similar]", err);
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
