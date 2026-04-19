import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { endSession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logout only succeeds when a session cookie is actually present. Hitting
 * POST /api/auth/logout without a cookie returns 401 — stops attackers
 * from clearing a victim cookie via a CSRF-forced logout and avoids
 * silently acknowledging unauthenticated callers.
 */
export async function POST() {
  const store = await cookies();
  if (!store.get(SESSION_COOKIE)?.value) {
    return NextResponse.json({ error: "Pas de session" }, { status: 401 });
  }
  await endSession();
  return NextResponse.json({ ok: true });
}
