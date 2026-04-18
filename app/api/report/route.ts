import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createReport } from "@/lib/server-db";
import { quarantineProjectForCsam } from "@/lib/reports";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The legacy `createReport` only accepts project|comment targets. User/sequel
// report types from V8 §19.5 will land when reports fully migrate to Prisma.
interface Body {
  targetType: "project" | "comment";
  targetId: string;
  reason: string;
  detail?: string;
}

/**
 * Content report endpoint. Persists to the JSON DB and logs to console.
 * The admin moderation queue at /admin/reports reads from the same table.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    if (!body.targetType || !body.targetId || !body.reason) {
      return NextResponse.json(
        { error: "Raison et contenu à signaler requis." },
        { status: 400 }
      );
    }

    const report = await createReport({
      reporterId: user.id,
      reporterEmail: user.email,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
      detail: body.detail?.trim().slice(0, 500) || undefined,
    });

    // eslint-disable-next-line no-console
    console.log(`[report] Nouveau signalement ${report.id} — ${body.reason} → ${body.targetType}/${body.targetId}`);

    // V8 §19.5 — CSAM zero-tolerance: hide the project immediately, alert
    // Sentry/Discord (via captureError on a dedicated tag), and let the admin
    // take the final decision in /admin/reports.
    if (body.reason === "csam" && body.targetType === "project") {
      await quarantineProjectForCsam(body.targetId).catch(() => {});
      captureError(new Error(`CSAM report on project ${body.targetId}`), {
        route: "report.csam-auto-quarantine",
        userId: user.id,
        projectId: body.targetId,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, reportId: report.id });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
