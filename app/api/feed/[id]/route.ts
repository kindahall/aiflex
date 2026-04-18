import { NextResponse } from "next/server";
import { findUserById, getProjectById } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public film detail — only returns the project if it's actually published
 * public. This is a *pure* read; the view counter is bumped by the SSR
 * watch page (`/watch/[id]`) instead, which is the canonical entry point.
 * Doing it here too would double-count whenever a client also pings the
 * API after navigation.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project || !project.published || project.visibility !== "public") {
    return NextResponse.json({ error: "Film introuvable" }, { status: 404 });
  }
  const owner = await findUserById(project.ownerId);
  return NextResponse.json({
    project: {
      id: project.id,
      concept: project.concept,
      scenes: project.scenes,
      genre: project.genre,
      format: project.format,
      tone: project.tone,
      publishedAt: project.publishedAt,
      views: project.views || 0,
      likes: project.likes || 0,
      author: owner?.name || project.author || "Créateur AIflex",
    },
  });
}
