import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { deleteProjectById, getProjectById, updateProject } from "@/lib/server-db";
import type { Project } from "@/lib/types";
import { logAdminAction } from "@/lib/audit";
import { swallowAndReport } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whitelist of Project fields an admin can mutate from this endpoint.
// Any other field (financial, ownership, provider IDs, etc.) is dropped,
// preventing mass-assignment if the Project schema grows later.
const ADMIN_MUTABLE_KEYS = [
  "stage",
  "idea",
  "genre",
  "format",
  "tone",
  "endingHint",
  "concept",
  "scenario",
  "scenes",
  "seriesId",
  "seriesTitle",
  "episodeNumber",
  "coverUrl",
  "audioTrackUrl",
  "audioTrackStatus",
  "published",
  "visibility",
  "publishedAt",
  "author",
  "contentRating",
] as const satisfies ReadonlyArray<keyof Project>;

type AdminMutableKey = (typeof ADMIN_MUTABLE_KEYS)[number];

function pickAdminPatch(body: unknown): Partial<Project> {
  if (!body || typeof body !== "object") return {};
  const src = body as Record<string, unknown>;
  const out: Partial<Project> = {};
  for (const key of ADMIN_MUTABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      (out as Record<AdminMutableKey, unknown>)[key] = src[key];
    }
  }
  return out;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const raw = (await req.json()) as unknown;
    const patch = pickAdminPatch(raw);
    const p = await getProjectById(id);
    if (!p) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const updated = await updateProject(id, patch);
    logAdminAction({
      adminId: admin.id,
      action: "approve_film",
      targetId: id,
      targetType: "film",
      metadata: { patchKeys: Object.keys(patch) },
    }).catch(swallowAndReport("admin/projects/[id]/log"));
    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteProjectById(id);
    logAdminAction({
      adminId: admin.id,
      action: "delete_film",
      targetId: id,
      targetType: "film",
    }).catch(swallowAndReport("admin/projects/[id]/log"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
