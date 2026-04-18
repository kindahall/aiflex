import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  projectId: string;
  emails: string[];
}

/**
 * Add/remove invited emails on a `visibility=private_circle` project.
 * V7 §3.4 — private cercles d'amis.
 *
 * Keeps the stored list deduplicated + lowercased. Owners only.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;
    if (!body.projectId || !Array.isArray(body.emails)) {
      return NextResponse.json({ error: "Champs requis" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { id: true, ownerId: true, visibility: true, inviteToken: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    if (project.visibility !== "private_circle") {
      return NextResponse.json(
        { error: "Le projet n'est pas en cercle privé." },
        { status: 400 }
      );
    }

    const clean = Array.from(
      new Set(
        body.emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    ).slice(0, 50);

    await prisma.project.update({
      where: { id: project.id },
      data: { invitedEmails: clean },
    });

    return NextResponse.json({
      invitedEmails: clean,
      shareUrl: `/watch/invite/${project.inviteToken}`,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
