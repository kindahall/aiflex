import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitChallengeEntry } from "@/lib/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entries = await prisma.challengeEntry.findMany({
    where: { challengeId: id },
    orderBy: { votes: "desc" },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          coverUrl: true,
          ownerId: true,
          views: true,
        },
      },
    },
    take: 200,
  });
  return NextResponse.json({ entries });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: challengeId } = await params;
    const body = (await req.json()) as { projectId?: string };
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId requis" }, { status: 400 });
    }
    const entry = await submitChallengeEntry({
      challengeId,
      userId: user.id,
      projectId: body.projectId,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
