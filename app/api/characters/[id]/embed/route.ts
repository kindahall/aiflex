import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { backfillCharacterEmbedding } from "@/lib/instant-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Manually trigger facial embedding extraction for a Character (V8 §28.4).
 * Owner-only. Useful when a character was created before the InstantID
 * pipeline existed, or when the reference image was changed.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const character = await prisma.character.findUnique({
      where: { id },
      select: { creatorId: true },
    });
    if (!character) {
      return NextResponse.json({ error: "Personnage introuvable" }, { status: 404 });
    }
    if (character.creatorId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    const result = await backfillCharacterEmbedding(id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
