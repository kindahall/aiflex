import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeLaunchAt, type FilmFormat } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RescheduleBody {
  scheduledAt: string | null;
}

/**
 * Change the `scheduledAt` of a job that hasn't started yet. The
 * orchestrator computes the new `launchAt` from the format's estimated
 * duration + buffer. Passing `null` clears scheduling and runs immediately.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobId } = await params;
    const body = (await req.json()) as RescheduleBody;

    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true, status: true, format: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    if (job.userId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    // Only idle states can be rescheduled
    if (
      job.status !== "pending" &&
      job.status !== "scheduled" &&
      job.status !== "awaiting_validation"
    ) {
      return NextResponse.json(
        { error: `Job déjà lancé (status=${job.status})` },
        { status: 400 }
      );
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const launchAt = computeLaunchAt(job.format as FilmFormat, scheduledAt);

    const nextStatus =
      scheduledAt && launchAt && launchAt > new Date()
        ? "scheduled"
        : job.status === "awaiting_validation"
          ? "awaiting_validation"
          : "pending";

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { scheduledAt, launchAt, status: nextStatus },
    });

    return NextResponse.json({ scheduledAt, launchAt, status: nextStatus });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
