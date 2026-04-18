import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { voteForEntry } from "@/lib/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cast a vote on a challenge entry. V8 §24.5 — 1 vote per user per
 * challenge. Client-side dedup for MVP; consider a `ChallengeVote` table
 * once the fraud surface matters.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    await requireUser();
    const { entryId } = await params;
    await voteForEntry(entryId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
