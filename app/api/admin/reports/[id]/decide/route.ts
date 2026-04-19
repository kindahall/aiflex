import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { getTrustedClientIp } from "@/lib/client-ip";
import { applyReportDecision, type ReportAction } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  action: ReportAction;
}

const ALLOWED: ReportAction[] = ["removed", "warned", "suspended", "none"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as Body;
    if (!ALLOWED.includes(body.action)) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }
    const trustedIp = getTrustedClientIp(req);
    await applyReportDecision({
      reportId: id,
      adminId: user.id,
      action: body.action,
      ipAddress: trustedIp !== "anonymous" ? trustedIp : undefined,
    });
    return NextResponse.json({ ok: true, action: body.action });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
