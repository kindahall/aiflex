import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { listReports, updateReportStatus } from "@/lib/server-db";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as
      | Report["status"]
      | null;
    const reports = await listReports(status || undefined);
    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PatchBody {
  reportId: string;
  status: "reviewed" | "dismissed";
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json()) as PatchBody;
    if (!body.reportId || !body.status) {
      return NextResponse.json(
        { error: "reportId et status requis" },
        { status: 400 }
      );
    }
    const updated = await updateReportStatus(
      body.reportId,
      body.status,
      admin.id
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Report introuvable" },
        { status: 404 }
      );
    }
    return NextResponse.json({ report: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
