import { NextResponse } from "next/server";
import { AuthError, getCurrentUser, requireUser } from "@/lib/auth";
import {
  findUserById,
  followUser,
  getFollowerCount,
  getFollowingCount,
  isFollowing,
  unfollowUser,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    → { following: boolean, followers: number, following_count: number }
 * POST   → follow the user
 * DELETE → unfollow the user
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const me = await getCurrentUser();
    const following = me ? await isFollowing(me.id, id) : false;
    const followers = await getFollowerCount(id);
    const followingCount = await getFollowingCount(id);
    return NextResponse.json({ following, followers, followingCount });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const me = await requireUser();
    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }
    await followUser(me.id, id);
    const followers = await getFollowerCount(id);
    // Notify the followed user.
    notify({
      userId: id,
      kind: "system",
      message: `${me.name} te suit maintenant`,
      href: `/u/${me.id}`,
      actorId: me.id,
      actorName: me.name,
    }).catch((e) => console.error("[notification] failed:", e));
    return NextResponse.json({ following: true, followers });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const me = await requireUser();
    await unfollowUser(me.id, id);
    const followers = await getFollowerCount(id);
    return NextResponse.json({ following: false, followers });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
