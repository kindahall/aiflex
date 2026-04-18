import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resumeValidatedJob } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ValidateBody {
  validatedData?: unknown; // full scenarioData payload (scenes/characters edited by user)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobId } = await params;

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true, status: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    if (job.userId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    if (job.status !== "awaiting_validation") {
      return NextResponse.json(
        { error: `Job non en attente de validation (status=${job.status})` },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as ValidateBody;

    // Resume — fire-and-forget again; UI keeps polling.
    resumeValidatedJob(
      jobId,
      body.validatedData as Parameters<typeof resumeValidatedJob>[1]
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[agent/validate] resume ${jobId} failed:`, err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
