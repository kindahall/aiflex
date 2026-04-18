import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  sendBroadcast,
  type BroadcastSegment,
} from "@/lib/email-broadcast";
import { logAdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface Body {
  segment: BroadcastSegment;
  subject: string;
  textBody: string;
  htmlBody?: string;
  dryRun?: boolean;
  limit?: number;
}

const VALID_SEGMENTS: BroadcastSegment[] = [
  "all",
  "creators",
  "subscribers_active",
  "inactive_14d",
];

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    const body = (await req.json()) as Body;

    if (!body.segment || !VALID_SEGMENTS.includes(body.segment)) {
      return NextResponse.json({ error: "Segment invalide" }, { status: 400 });
    }
    if (!body.subject?.trim() || !body.textBody?.trim()) {
      return NextResponse.json(
        { error: "Sujet et corps texte requis" },
        { status: 400 }
      );
    }

    const result = await sendBroadcast({
      segment: body.segment,
      subject: body.subject,
      textBody: body.textBody,
      htmlBody: body.htmlBody,
      dryRun: !!body.dryRun,
      limit: body.limit,
    });

    if (!body.dryRun) {
      logAdminAction({
        adminId: user.id,
        action: "update_settings", // reuse enum; ideally a "send_broadcast" entry
        targetId: body.segment,
        targetType: "settings",
        metadata: {
          subject: body.subject,
          recipients: result.recipients,
          delivered: result.delivered,
        },
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[admin/broadcast]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
