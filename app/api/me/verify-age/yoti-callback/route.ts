import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getYotiSessionStatus } from "@/lib/yoti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Yoti webhook callback (V8 §19.4).
 *
 * Yoti POSTs us a notification when a session completes. We re-fetch the
 * session to confirm authenticity (don't trust the body alone) then
 * persist `User.ageVerified = "verified"` if the check passed.
 *
 * Auth: optional shared bearer token via `YOTI_WEBHOOK_TOKEN` (matches
 * what we send at session create time as `notifications.auth_token`).
 */
export async function POST(req: Request) {
  // Auth check — Yoti can be configured to send a Bearer token
  const token = process.env.YOTI_WEBHOOK_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.includes(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { session_id?: string; topic?: string; user_tracking_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.session_id) {
    return NextResponse.json({ error: "session_id missing" }, { status: 400 });
  }

  // Re-pull the session — never trust the webhook body alone
  const status = await getYotiSessionStatus(body.session_id);

  // Only act on COMPLETED + verified
  if (status.state !== "COMPLETED" || !status.ageVerified) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      state: status.state,
      ageVerified: status.ageVerified,
    });
  }

  const userId = status.userTrackingId ?? body.user_tracking_id;
  if (!userId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no user" });
  }

  await prisma.user
    .update({
      where: { id: userId },
      data: { ageVerified: "verified", ageVerifiedAt: new Date() },
    })
    .catch(() => {
      // user might have been deleted between session creation and completion
    });

  return NextResponse.json({ ok: true, applied: true });
}

export const GET = POST;
