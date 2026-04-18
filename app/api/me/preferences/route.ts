import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/server-db";
import type { UserPreferences, DmPolicy } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DM_POLICIES: DmPolicy[] = ["everyone", "followers", "nobody"];

export async function GET() {
  try {
    const me = await requireUser();
    const record = await findUserById(me.id);
    const prefs: UserPreferences = record?.preferences ?? {};
    return NextResponse.json({
      preferences: {
        allowDMs: prefs.allowDMs ?? "everyone",
      },
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const me = await requireUser();
    const body = (await req.json()) as Partial<UserPreferences>;

    const record = await findUserById(me.id);
    if (!record) {
      return NextResponse.json(
        { error: "Compte introuvable" },
        { status: 404 }
      );
    }

    const next: UserPreferences = { ...(record.preferences ?? {}) };

    if (body.allowDMs !== undefined) {
      if (!DM_POLICIES.includes(body.allowDMs)) {
        return NextResponse.json(
          { error: "Valeur allowDMs invalide." },
          { status: 400 }
        );
      }
      next.allowDMs = body.allowDMs;
    }

    await updateUser(me.id, { preferences: next });
    return NextResponse.json({ preferences: next });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
