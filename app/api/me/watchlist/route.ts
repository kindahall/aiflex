import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, listWatchlist } from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the current user's watchlist, sanitized for client display
 * (same shape as the public feed — never expose ownerId/passwordHash etc).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const projects = await listWatchlist(user.id);
    const items = await Promise.all(projects.map((p) => sanitize(p)));
    return NextResponse.json({ projects: items });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

async function sanitize(p: Project) {
  const owner = await findUserById(p.ownerId);
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
    views: p.views || 0,
    likes: p.likes || 0,
    author: owner?.name || p.author || "Créateur AIflex",
  };
}
