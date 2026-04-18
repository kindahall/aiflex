import { NextResponse } from "next/server";
import { listActiveChallenges } from "@/lib/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const challenges = await listActiveChallenges();
  return NextResponse.json({ challenges });
}
