import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  addToWatchlist,
  getProjectById,
  inWatchlist,
  removeFromWatchlist,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Personal watchlist for a project. Always tied to the current user.
 *
 * GET    -> { saved: boolean }
 * POST   -> add to watchlist
 * DELETE -> remove from watchlist
 */

async function loadPublic(id: string) {
  const project = await getProjectById(id);
  if (!project || !project.published || project.visibility !== "public") {
    throw new AuthError("Film introuvable", 404);
  }
  return project;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadPublic(id);
    const saved = await inWatchlist(user.id, id);
    return NextResponse.json({ saved });
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
    const user = await requireUser();
    await loadPublic(id);
    await addToWatchlist(user.id, id);
    return NextResponse.json({ saved: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadPublic(id);
    await removeFromWatchlist(user.id, id);
    return NextResponse.json({ saved: false });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
