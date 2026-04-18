import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Block / unblock a user (V8 §24.4).
 *
 * POST   → block (idempotent — already-blocked is a no-op)
 * DELETE → unblock
 *
 * The Block model is consulted by the messages POST handler to refuse
 * sends from blocked users; future surfaces (DM start, comment reply
 * notification) should also check it.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: blockedUserId } = await params;
    if (blockedUserId === user.id) {
      return NextResponse.json({ error: "Tu ne peux pas te bloquer" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    await prisma.block.upsert({
      where: { userId_blockedUserId: { userId: user.id, blockedUserId } },
      create: { userId: user.id, blockedUserId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: blockedUserId } = await params;
    await prisma.block
      .delete({
        where: { userId_blockedUserId: { userId: user.id, blockedUserId } },
      })
      .catch(() => {}); // not blocked → fine
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
