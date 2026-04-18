import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shorts feed (V8 §24.6) — vertical 9:16 films < 60s. Returns a paged
 * cursor for infinite scroll.
 *
 * Query: ?cursor=<id>&limit=20
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || "20")));

  const items = await prisma.project.findMany({
    where: {
      published: true,
      visibility: "public",
      status: "ready",
      format: "short_vertical",
      isDisavowed: false,
    },
    orderBy: [
      { publishedAt: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      synopsis: true,
      outputUrl: true,
      thumbnailUrl: true,
      coverUrl: true,
      genre: true,
      views: true,
      likes: true,
      publishedAt: true,
      ownerId: true,
      owner: { select: { name: true, avatarSeed: true } },
    },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return NextResponse.json({
    items: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
