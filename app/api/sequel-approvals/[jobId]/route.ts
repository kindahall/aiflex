import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orchestrateGeneration } from "@/lib/agent";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  decision: "approve" | "reject";
  reason?: string;
}

/**
 * Parent creator approves or rejects a pending sequel (V8 §20.3).
 *
 * Auth gate: only the owner of the PARENT film can decide. On reject we
 * credit the sequel-creator's `user.credits` with the price they paid (or
 * would have paid — this layer is upstream of Stripe webhook).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobId } = await params;
    const body = (await req.json()) as Body;

    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
    }

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        userId: true,
        formData: true,
      },
    });
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    if (job.status !== "awaiting_validation") {
      return NextResponse.json(
        { error: "Ce job n'est pas en attente d'approbation parent." },
        { status: 400 }
      );
    }

    const formData = (job.formData as Record<string, unknown>) || {};
    const parentFilmId = formData.parentFilmId as string | undefined;
    const priceCents = (formData.priceCents as number | undefined) ?? 0;
    if (!parentFilmId) {
      return NextResponse.json(
        { error: "Job ne référence pas de film parent." },
        { status: 400 }
      );
    }

    const parent = await prisma.project.findUnique({
      where: { id: parentFilmId },
      select: { id: true, ownerId: true, title: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Film parent introuvable" }, { status: 404 });
    }
    if (parent.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Seul le créateur du film parent peut décider." },
        { status: 403 }
      );
    }

    if (body.decision === "approve") {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "pending" },
      });
      orchestrateGeneration(jobId).catch(() => {});

      notify({
        userId: job.userId,
        kind: "system",
        message: `✅ Le créateur de "${parent.title ?? "l'œuvre originale"}" a approuvé ta suite — la génération démarre.`,
        href: `/agent/validate/${jobId}`,
      }).catch(() => {});

      return NextResponse.json({ ok: true, decision: "approve" });
    }

    // REJECT — credit the sequel creator + close the job
    await prisma.$transaction([
      prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          errorMessage:
            body.reason ||
            `Suite refusée par le créateur de "${parent.title ?? "l'œuvre originale"}".`,
        },
      }),
      ...(priceCents > 0
        ? [
            prisma.user.update({
              where: { id: job.userId },
              data: { credits: { increment: priceCents } },
            }),
          ]
        : []),
    ]);

    notify({
      userId: job.userId,
      kind: "system",
      message:
        priceCents > 0
          ? `❌ Suite refusée par le créateur original. Un avoir de $${(priceCents / 100).toFixed(2)} a été crédité sur ton compte.`
          : `❌ Suite refusée par le créateur original.`,
      href: `/dashboard`,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      decision: "reject",
      creditedCents: priceCents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
