import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  extractFacialEmbedding,
  findSimilarPublicCharacters,
} from "@/lib/instant-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface Body {
  /** Either a Character id we already own, or a raw image URL to embed first. */
  characterId?: string;
  imageUrl?: string;
  limit?: number;
}

/**
 * Find public characters whose face is similar to the input (V8 §28.4 +
 * §28.5). Used by the marketplace "this looks like X" hint.
 *
 * Auth required to avoid being a free embedding service.
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.characterId && !body.imageUrl) {
      return NextResponse.json(
        { error: "characterId ou imageUrl requis" },
        { status: 400 }
      );
    }

    let imageUrl = body.imageUrl;
    if (body.characterId) {
      const c = await prisma.character.findUnique({
        where: { id: body.characterId },
        select: { referenceImageUrl: true },
      });
      if (!c?.referenceImageUrl) {
        return NextResponse.json(
          { error: "Personnage sans image de référence" },
          { status: 400 }
        );
      }
      imageUrl = c.referenceImageUrl;
    }

    const ext = await extractFacialEmbedding(imageUrl!);
    if (ext.skipped || !ext.embedding) {
      return NextResponse.json({
        skipped: true,
        reason: ext.reason,
        matches: [],
      });
    }
    const matches = await findSimilarPublicCharacters(ext.embedding, {
      limit: body.limit ?? 5,
    });
    return NextResponse.json({ matches });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[characters/similar]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
