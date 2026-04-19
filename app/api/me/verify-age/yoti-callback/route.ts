import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getYotiSessionStatus } from "@/lib/yoti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerTokenEquals(header: string, expected: string): boolean {
  // Accept "Bearer <token>" or raw token; compare in constant time.
  const trimmed = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  const a = Buffer.from(trimmed, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Yoti webhook callback (V8 §19.4).
 *
 * Yoti POSTs us a notification when a session completes. We re-fetch the
 * session to confirm authenticity (don't trust the body alone) then
 * persist `User.ageVerified = "verified"` if the check passed.
 *
 * Auth: mandatory shared bearer token via `YOTI_WEBHOOK_TOKEN`. The
 * comparison is constant-time and equality-only — NEVER substring — to
 * prevent timing side-channel + sub-string bypass.
 *
 * Only POST is accepted. GET is not a webhook delivery method and opening
 * it would open a CSRF-friendly handler.
 */
export async function POST(req: Request) {
  const token = process.env.YOTI_WEBHOOK_TOKEN;
  if (!token) {
    // Without a configured shared secret we cannot authenticate Yoti,
    // so refuse rather than allow unauthenticated writes.
    return NextResponse.json({ error: "Yoti webhook token non configuré" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!bearerTokenEquals(auth, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
