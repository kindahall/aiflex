import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getJobsByUser, type JobStatus } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs — List jobs for the current user.
 * Query params: type, status
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || undefined;
    const status = (url.searchParams.get("status") as JobStatus) || undefined;

    const jobs = getJobsByUser(user.id, { type, status });

    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress ?? 0,
        result: j.status === "completed" ? j.result : undefined,
        error: j.status === "failed" ? j.error : undefined,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
