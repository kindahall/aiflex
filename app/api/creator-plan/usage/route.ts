import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getCreatorProStatus } from "@/lib/creator-pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const status = await getCreatorProStatus(user.id);
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
