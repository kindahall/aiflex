import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getReferralStatus } from "@/lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current user's referral link + counters (V8 §21.3).
 * Creates the link on first call if it doesn't exist.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const status = await getReferralStatus(user.id);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
