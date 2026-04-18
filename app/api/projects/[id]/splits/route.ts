import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SplitInput {
  userId: string;
  percent: number;
}
interface PutBody {
  splits: SplitInput[];
}

/**
 * Manage CollaboratorSplit rows (V8 §23.6 / V7 §8.1 collab payouts).
 *
 * Rules:
 *   - Only the project owner can change splits.
 *   - Sum of all collab percents must be ≤ 100 (the principal creator
 *     keeps `100 - sum` as their primary share — see lib/payouts.ts).
 *   - Each collaborator must already exist as a User. We don't auto-invite
 *     here; the owner adds them manually via the existing Collaborator UI
 *     before configuring splits.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    const splits = await prisma.collaboratorSplit.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ splits });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: projectId } = await params;
    const body = (await req.json()) as PutBody;

    if (!Array.isArray(body.splits)) {
      return NextResponse.json({ error: "splits requis" }, { status: 400 });
    }
    const sum = body.splits.reduce(
      (acc, s) => acc + Math.max(0, Math.floor(s.percent)),
      0
    );
    if (sum > 100) {
      return NextResponse.json(
        { error: `Somme des parts (${sum}%) > 100%.` },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    // Reject splits that would assign the owner themselves a slice — the
    // owner already gets `100 - sum`.
    if (body.splits.some((s) => s.userId === user.id)) {
      return NextResponse.json(
        { error: "Le créateur principal ne peut pas figurer dans la liste — il garde automatiquement le reste." },
        { status: 400 }
      );
    }

    // Validate every userId exists
    const userIds = body.splits.map((s) => s.userId);
    if (userIds.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });
      if (found.length !== userIds.length) {
        return NextResponse.json(
          { error: "Un ou plusieurs collaborateurs sont introuvables." },
          { status: 400 }
        );
      }
    }

    // Replace atomically
    await prisma.$transaction([
      prisma.collaboratorSplit.deleteMany({ where: { projectId } }),
      ...body.splits
        .filter((s) => s.percent > 0)
        .map((s) =>
          prisma.collaboratorSplit.create({
            data: {
              projectId,
              userId: s.userId,
              percent: Math.floor(s.percent),
            },
          })
        ),
    ]);

    return NextResponse.json({ ok: true, ownerShare: 100 - sum });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
