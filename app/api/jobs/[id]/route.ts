import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getJob } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[id] — Returns the status of a specific job.
 * Requires auth. Users can only see their own jobs.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const job = getJob(id);

    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }

    // Users can only view their own jobs (admins can see all)
    if (job.userId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress ?? 0,
      result: job.status === "completed" ? job.result : undefined,
      error: job.status === "failed" ? job.error : undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
