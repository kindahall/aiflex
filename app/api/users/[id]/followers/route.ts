import { NextResponse } from "next/server";
import { findUserById, listFollowers } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/users/:id/followers
 * Returns the list of users who follow the given user.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await findUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }
    const followers = await listFollowers(id);
    return NextResponse.json({
      followers: followers.map((u) => ({
        id: u.id,
        name: u.name,
        avatarSeed: u.avatarSeed || u.email,
        bio: u.bio || null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
