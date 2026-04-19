import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { AuthError, requireUser, SESSION_COOKIE, endSession } from "@/lib/auth";
import { deleteSession, listSessionsByUser } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicId(token: string): string {
  // Full 256-bit — match the listing route. Must agree on both ends so
  // the DELETE can look up the session by its public id.
  return createHash("sha256").update(token).digest("hex");
}

/** DELETE /api/me/sessions/[id] — revoke a specific session by its public id. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    const { id } = await params;

    const sessions = await listSessionsByUser(me.id);
    const target = sessions.find((s) => publicId(s.token) === id);
    if (!target) {
      return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
    }

    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value || "";
    const isCurrent = target.token === currentToken;

    if (isCurrent) {
      await endSession();
    } else {
      await deleteSession(target.token);
    }

    return NextResponse.json({ ok: true, current: isCurrent });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
