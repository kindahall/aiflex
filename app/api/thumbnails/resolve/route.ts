import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveBestThumbnail } from "@/lib/ab-thumbnails";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Weekly cron — promotes the winning A/B thumbnail (V8 §23.2).
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Projects with variants that weren't updated in the last 7 days
  // Prisma doesn't expose a clean "JSON not null" filter here; list and
  // filter in JS. At AIflex's scale the candidate pool stays small.
  const raw = await prisma.project.findMany({
    where: { updatedAt: { lt: cutoff }, published: true, visibility: "public" },
    select: { id: true, thumbnailVariants: true },
    take: 2000,
  });
  const candidates = raw.filter(
    (p) => Array.isArray(p.thumbnailVariants) && (p.thumbnailVariants as unknown[]).length > 0
  );

  let resolved = 0;
  let skipped = 0;
  for (const { id } of candidates) {
    const res = await resolveBestThumbnail(id);
    if (res.resolved) resolved++;
    else skipped++;
  }
  return NextResponse.json({ considered: candidates.length, resolved, skipped });
}

export const GET = POST;
