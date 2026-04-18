import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getProfileById, updateProfile, deleteProfile } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT — update a profile. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      isChild?: boolean;
      maxRating?: string;
      avatarSeed?: string;
    };

    const profile = await getProfileById(id);
    if (!profile || profile.userId !== user.id) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    const validRatings = ["G", "PG", "PG-13", "R"];
    if (body.maxRating && !validRatings.includes(body.maxRating)) {
      return NextResponse.json({ error: "Rating invalide" }, { status: 400 });
    }

    const updated = await updateProfile(id, {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.isChild !== undefined ? { isChild: body.isChild } : {}),
      ...(body.maxRating ? { maxRating: body.maxRating as "G" | "PG" | "PG-13" | "R" } : {}),
      ...(body.avatarSeed ? { avatarSeed: body.avatarSeed } : {}),
    });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE — remove a profile. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const profile = await getProfileById(id);
    if (!profile || profile.userId !== user.id) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    await deleteProfile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
