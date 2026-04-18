import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertProjectEmbedding } from "@/lib/recommendations-vec";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 600;

/**
 * Backfill Project embeddings (V8 §B4.5).
 * Body: { limit?: number } — default 100 projects per run. Safe to re-run.
 */
export async function POST(req: Request) {
  if (!verifyCronRequest(req).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 100;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    if (body.limit && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(1000, body.limit));
    }
  } catch {
    /* no body */
  }

  // Find projects without an embedding that are eligible (public + ready)
  type Row = { id: string };
  let toBackfill: Row[] = [];
  try {
    toBackfill = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id FROM "Project"
       WHERE published = true
         AND visibility = 'public'
         AND status = 'ready'
         AND embedding IS NULL
       ORDER BY "createdAt" DESC
       LIMIT $1`,
      limit
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "pgvector not available or Project.embedding column missing. Run `CREATE EXTENSION vector` and migrate.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  let done = 0;
  let skipped = 0;
  for (const row of toBackfill) {
    try {
      const ok = await upsertProjectEmbedding(row.id);
      if (ok) done++;
      else skipped++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({
    considered: toBackfill.length,
    embedded: done,
    skipped,
  });
}

export const GET = POST;
