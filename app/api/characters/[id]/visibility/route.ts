import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { setCharacterPublic } from "@/lib/character-marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  public: boolean;
  licensePercent?: number;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: characterId } = await params;
    const body = (await req.json()) as Body;

    const updated = await setCharacterPublic({
      characterId,
      ownerId: user.id,
      public: !!body.public,
      licensePercent: body.licensePercent,
    });
    return NextResponse.json({ character: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
