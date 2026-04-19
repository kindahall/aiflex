import { NextResponse } from "next/server";
import { findUsersByIds, listPublicProjects } from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/**
 * Public feed of films published by the community. Returns only the fields
 * safe to show to unauthenticated viewers. Paginated — the full list is
 * unbounded and would otherwise be a free DoS vector.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const all = await listPublicProjects();
  const total = all.length;
  const page = all.slice(offset, offset + limit);

  const ownerIds = Array.from(new Set(page.map((p) => p.ownerId)));
  const owners = await findUsersByIds(ownerIds);

  const enriched = page.map((p) =>
    sanitize(p, owners.get(p.ownerId)?.name || p.author || "Créateur AIflex")
  );
  return NextResponse.json({
    projects: enriched,
    pagination: { total, limit, offset, nextOffset: offset + page.length },
  });
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
