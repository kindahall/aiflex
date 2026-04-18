import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { licenseCharacter } from "@/lib/character-marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  projectId?: string;
}

/**
 * License a public character into one of the borrower's projects (V8 §28.5).
 * Records the royalty rate at license time so subsequent rate changes by
 * the original creator don't apply retroactively.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: characterId } = await params;
    const body = (await req.json().catch(() => ({}))) as Body;

    const license = await licenseCharacter({
      characterId,
      borrowerId: user.id,
      projectId: body.projectId,
    });
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
