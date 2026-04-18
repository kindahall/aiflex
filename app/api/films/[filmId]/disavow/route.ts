import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disavow a sequel: remove it from the parent's extended-universe tree.
 * Only the ORIGINAL CREATOR of the parent film can trigger this (V7 §4.4).
 * The sequel remains accessible via direct link, but royalty payments stop
 * at the next monthly payout cycle.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ filmId: string }> }
) {
  try {
    const user = await requireUser();
    const { filmId } = await params;

    const sequel = await prisma.project.findUnique({
      where: { id: filmId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        parentFilmId: true,
        parentFilm: {
          select: { id: true, ownerId: true, title: true },
        },
      },
    });
    if (!sequel || !sequel.parentFilm) {
      return NextResponse.json({ error: "Suite introuvable" }, { status: 404 });
    }
    if (sequel.parentFilm.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Seul le créateur du film original peut désavouer une suite." },
        { status: 403 }
      );
    }

    await prisma.project.update({
      where: { id: sequel.id },
      data: { isDisavowed: true },
    });

    // Notify sequel creator (V7 §4.4)
    notify({
      userId: sequel.ownerId,
      kind: "system",
      message: `Ta suite "${sequel.title ?? "sans titre"}" a été désavouée par le créateur de "${sequel.parentFilm.title ?? "l'œuvre originale"}".`,
      href: `/watch/${sequel.id}`,
      projectId: sequel.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
