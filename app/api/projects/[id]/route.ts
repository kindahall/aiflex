import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  deleteProjectById,
  getProjectById,
  updateProject,
} from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwned(id: string) {
  const user = await requireUser();
  const project = await getProjectById(id);
  if (!project) throw new AuthError("Projet introuvable", 404);
  if (project.ownerId !== user.id && user.role !== "admin")
    throw new AuthError("Accès refusé", 403);
  return { user, project };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { project } = await loadOwned(id);
    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await loadOwned(id);
    const body = (await req.json()) as Partial<Project>;
    // Disallow changing ownership or IDs via PATCH
    delete body.id;
    delete body.ownerId;
    delete body.createdAt;
    const updated = await updateProject(id, body);
    return NextResponse.json({ project: updated });
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
    await loadOwned(id);
    await deleteProjectById(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
