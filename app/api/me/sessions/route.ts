import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { AuthError, requireUser, SESSION_COOKIE } from "@/lib/auth";
import { listSessionsByUser, deleteSessionsForUserExcept } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-reversible short identifier for a session token, safe to return. */
function publicId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export async function GET() {
  try {
    const me = await requireUser();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value || "";
    const sessions = await listSessionsByUser(me.id);
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: publicId(s.token),
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: s.token === currentToken,
      })),
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
