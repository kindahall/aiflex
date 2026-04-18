import { NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog";
import { findUsersByIds, listPublicProjects } from "@/lib/server-db";
import type { Genre, Project } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross-source search across the curated catalog and the live community
 * feed. Filters: free-text query, genre, source ("all" | "community" |
 * "catalog"). No external indexer — for the prototype this is a plain
 * substring scan, which is fine while the corpus is small. Swap for
 * Postgres FTS once we migrate the DB.
 */

export interface SearchHit {
  id: string;
  source: "community" | "catalog";
  title: string;
  tagline: string;
  description: string;
  genre: string;
  coverUrl: string;
  author: string;
  durationMin: number;
  rating?: number;
  year?: number;
  likes?: number;
  views?: number;
  href: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const genre = (url.searchParams.get("genre") || "").trim() as Genre | "";
  const source = (url.searchParams.get("source") || "all") as
    | "all"
    | "community"
    | "catalog";
  const sort = (url.searchParams.get("sort") || "pertinence") as
    | "pertinence"
    | "recent"
    | "populaire";

  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(MAX_LIMIT, Math.floor(limitParam))
    : DEFAULT_LIMIT;
  const offsetParam = Number(url.searchParams.get("offset"));
  const offset = Number.isFinite(offsetParam) && offsetParam > 0
    ? Math.floor(offsetParam)
    : 0;

  const hits: SearchHit[] = [];

  if (source !== "community") {
    for (const c of CATALOG) {
      if (genre && c.genre !== genre) continue;
      if (q && !matches(q, [c.title, c.tagline, c.description, c.author]))
        continue;
      hits.push({
        id: c.id,
        source: "catalog",
        title: c.title,
        tagline: c.tagline,
        description: c.description,
        genre: c.genre,
        coverUrl: c.coverUrl,
        author: c.author,
        durationMin: c.durationMin,
        rating: c.rating,
        year: c.year,
        href: `/watch/${c.id}`,
      });
    }
  }

  if (source !== "catalog") {
    const projects = await listPublicProjects();
    // Filter first (cheap), then batch-load owners for matches only.
    const matched: Project[] = [];
    for (const p of projects) {
      if (genre && p.genre !== genre) continue;
      const fields = [
        p.concept?.title,
        p.concept?.logline,
        p.concept?.synopsis,
        p.idea,
        p.author,
      ].filter(Boolean) as string[];
      if (q && !matches(q, fields)) continue;
      matched.push(p);
    }
    const ownerIds = Array.from(new Set(matched.map((p) => p.ownerId)));
    const owners = await findUsersByIds(ownerIds);
    for (const p of matched) {
      const owner = owners.get(p.ownerId);
      hits.push(projectToHit(p, owner?.name || p.author || "Créateur AIflex"));
    }
  }

  // Sort based on user preference.
  if (sort === "recent") {
    hits.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else if (sort === "populaire") {
    hits.sort((a, b) => (b.likes || b.rating || 0) - (a.likes || a.rating || 0));
  } else {
    // Default: community first, then by engagement.
    hits.sort((a, b) => {
      if (a.source !== b.source) return a.source === "community" ? -1 : 1;
      return (b.likes || b.rating || 0) - (a.likes || a.rating || 0);
    });
  }

  const total = hits.length;
  const paginated = hits.slice(offset, offset + limit);
  return NextResponse.json({
    hits: paginated,
    query: { q, genre, source, limit, offset },
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  });
}

function matches(needle: string, haystacks: string[]): boolean {
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

function projectToHit(p: Project, author: string): SearchHit {
  const sceneCount = p.scenes?.length || 0;
  return {
    id: p.id,
    source: "community",
    title: p.concept?.title || "Sans titre",
    tagline: p.concept?.logline || p.idea,
    description: p.concept?.synopsis || "",
    genre: p.genre,
    coverUrl:
      p.coverUrl ||
      p.scenes?.[0]?.imageUrl ||
      `https://picsum.photos/seed/feed-${p.id}/1280/720`,
    author,
    durationMin: Math.max(1, Math.round((sceneCount * 8) / 60)),
    year: new Date(p.publishedAt || p.updatedAt).getFullYear(),
    likes: p.likes || 0,
    views: p.views || 0,
    href: `/watch/${p.id}`,
  };
}
