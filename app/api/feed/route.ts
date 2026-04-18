import { NextResponse } from "next/server";
import { findUserById, listPublicProjects } from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public feed of films published by the community. Returns only the fields
 * safe to show to unauthenticated viewers.
 */
export async function GET() {
  const projects = await listPublicProjects();
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const owner = await findUserById(p.ownerId);
      return sanitize(p, owner?.name || p.author || "Créateur AIflex");
    })
  );
  return NextResponse.json({ projects: enriched });
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
    // First scene with a video URL — used for hover preview on cards.
    previewUrl: p.scenes?.find((s) => s.videoUrl)?.videoUrl || null,
  };
}
