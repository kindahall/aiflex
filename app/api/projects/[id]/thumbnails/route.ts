import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setThumbnailVariants } from "@/lib/ab-thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  urls: string[]; // 2-3 thumbnail candidates
}

/**
 * Upload a new set of A/B thumbnail candidates for a project (V8 §23.2).
 * Replaces any existing variants and resets counters.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as Body;

    if (!Array.isArray(body.urls) || body.urls.length < 2 || body.urls.length > 3) {
      return NextResponse.json(
        { error: "Fournis entre 2 et 3 URLs de thumbnails." },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    await setThumbnailVariants(id, body.urls);
    return NextResponse.json({ ok: true, count: body.urls.length });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
