import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import {
  deleteProjectById,
  getProjectById,
  updateProject,
} from "@/lib/server-db";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as Partial<Project>;
    delete body.id;
    delete body.ownerId;
    delete body.createdAt;
    const p = await getProjectById(id);
    if (!p)
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
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
    await requireAdmin();
    const { id } = await params;
    await deleteProjectById(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
