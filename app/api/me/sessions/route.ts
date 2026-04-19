import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { AuthError, requireUser, SESSION_COOKIE } from "@/lib/auth";
import { listSessionsByUser, deleteSessionsForUserExcept } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Non-reversible identifier for a session token, safe to return. Uses the
 * full 256-bit SHA-256 — truncating to 64 bits made birthday collisions
 * theoretically possible at a few billion sessions.
 */
function publicId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const DEFAULT_SESSIONS_LIMIT = 50;
const MAX_SESSIONS_LIMIT = 200;

export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value || "";
    const sessions = await listSessionsByUser(me.id);

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_SESSIONS_LIMIT);
    const rawOffset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(
      MAX_SESSIONS_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_SESSIONS_LIMIT)
    );
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

    const sorted = [...sessions].sort(
      (a, b) => (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt)
    );
    const total = sorted.length;
    const page = sorted.slice(offset, offset + limit);

    return NextResponse.json({
      sessions: page.map((s) => ({
        id: publicId(s.token),
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastSeenAt: s.lastSeenAt ?? s.createdAt,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        current: s.token === currentToken,
      })),
      pagination: { total, limit, offset, nextOffset: offset + page.length },
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE /api/me/sessions — revoke all sessions except the current one. */
export async function DELETE() {
  try {
    const me = await requireUser();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value || "";
    const removed = await deleteSessionsForUserExcept(me.id, currentToken);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
