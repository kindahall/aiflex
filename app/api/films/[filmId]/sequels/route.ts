import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sequel tree of a public film (V7 §4.5).
 *
 * Returns up to 3 levels of descendants, filtered on `isDisavowed = false`
 * and `status = "ready"`. Ordered by views DESC at each level.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filmId: string }> }
) {
  const { filmId } = await params;

  const root = await prisma.project.findUnique({
    where: { id: filmId },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      coverUrl: true,
      ownerId: true,
      visibility: true,
    },
  });
  if (!root || root.visibility !== "public") {
    return NextResponse.json({ error: "Film introuvable" }, { status: 404 });
  }

  const children = await loadChildren(root.id, 3);
  return NextResponse.json({ root, tree: children });
}

interface TreeNode {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  ownerId: string;
  views: number;
  createdAt: Date;
  children: TreeNode[];
}

async function loadChildren(parentId: string, depth: number): Promise<TreeNode[]> {
  if (depth <= 0) return [];
  const kids = await prisma.project.findMany({
    where: {
      parentFilmId: parentId,
      isDisavowed: false,
      status: "ready",
      visibility: "public",
    },
    orderBy: { views: "desc" },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      coverUrl: true,
      ownerId: true,
      views: true,
      createdAt: true,
    },
    take: 50,
  });

  const withGrandkids: TreeNode[] = [];
  for (const k of kids) {
    withGrandkids.push({
      ...k,
      children: await loadChildren(k.id, depth - 1),
    });
  }
  return withGrandkids;
}
