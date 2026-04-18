import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { listProfiles, createProfile } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROFILES = 5;

/** GET — list profiles for the current user. */
export async function GET() {
  try {
    const user = await requireUser();
    const profiles = await listProfiles(user.id);
    return NextResponse.json({ profiles });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — create a new profile. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      name: string;
      isChild?: boolean;
      maxRating?: string;
      avatarSeed?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    }

    const existing = await listProfiles(user.id);
    if (existing.length >= MAX_PROFILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PROFILES} profils atteint` },
        { status: 400 }
      );
    }

    const validRatings = ["G", "PG", "PG-13", "R"];
    const maxRating = body.maxRating || (body.isChild ? "PG" : "R");
    if (!validRatings.includes(maxRating)) {
      return NextResponse.json({ error: "Rating invalide" }, { status: 400 });
    }

    const profile = await createProfile({
      userId: user.id,
      name: body.name.trim(),
      avatarSeed: body.avatarSeed || body.name,
      isChild: body.isChild ?? false,
      maxRating: maxRating as "G" | "PG" | "PG-13" | "R",
    });

    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
