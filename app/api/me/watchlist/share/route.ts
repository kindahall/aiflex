import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate (or reset) a public share token for the user's watchlist
 * (V8 §22.3). Returns the token + a ready-to-share `/list/[token]` URL.
 *
 * POST  → ensures every Watchlist row has an `isPublic = true` and a
 *         `shareToken`; if a token already exists, reuses it.
 * DELETE → revokes (`isPublic = false`, clear token).
 */
export async function POST() {
  try {
    const user = await requireUser();
    const items = await prisma.watchlist.findMany({
      where: { userId: user.id },
    });
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Ta watchlist est vide." },
        { status: 400 }
      );
    }

    // Reuse the first existing share token across the whole list — semantically
    // a watchlist shares as a single object regardless of how many rows.
    let token = items.find((it) => it.shareToken)?.shareToken;
    if (!token) {
      token = crypto.randomBytes(12).toString("base64url");
    }

    await prisma.watchlist.updateMany({
      where: { userId: user.id },
      data: { shareToken: token, isPublic: true },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://aiflex.app";
    return NextResponse.json({
      shareToken: token,
      shareUrl: `${appUrl}/list/${token}`,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await prisma.watchlist.updateMany({
      where: { userId: user.id },
      data: { shareToken: null, isPublic: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
