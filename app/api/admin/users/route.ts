import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { listUsers, toPublicUser } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const users = (await listUsers()).map(toPublicUser);
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
