import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { deleteProjectById, getProjectById, updateProject } from "@/lib/server-db";
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

// Strict allowlist of fields a user is permitted to update on their own
// project. Admin-only / system-managed fields (`published`,
// `adminReviewStatus`, `views`, `likes`, `ppvPrice`, `isAdult`, `status`,
// `isDisavowed`, `amountPaid`, `creditIssued`, `creditAmount`,
// `stripePaymentId`, etc.) must NEVER be settable via PATCH — they go
// through dedicated endpoints with proper authorization.
const USER_EDITABLE_FIELDS = [
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
  "stage",
  "audioTrackUrl",
  "audioTrackStatus",
  "visibility",
  "contentRating",
  "author",
] as const;

const ADMIN_EDITABLE_FIELDS = [
  ...USER_EDITABLE_FIELDS,
  "published",
  "publishedAt",
  "views",
  "likes",
] as const;

const ALLOWED_VISIBILITY = new Set(["private", "followers", "public"]);
const ALLOWED_CONTENT_RATING = new Set(["G", "PG", "PG-13", "R"]);
const ALLOWED_STAGE = new Set([
  "idea",
  "concept",
  "scenario",
  "scenes",
  "visuals",
  "assembly",
  "published",
]);

function pickAllowed(body: Partial<Project>, allowed: readonly string[]): Partial<Project> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      out[key] = (body as Record<string, unknown>)[key];
    }
  }
  return out as Partial<Project>;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await loadOwned(id);
    const body = (await req.json()) as Partial<Project>;

    const allowed = user.role === "admin" ? ADMIN_EDITABLE_FIELDS : USER_EDITABLE_FIELDS;
    const picked = pickAllowed(body, allowed);

    // Constrain enumerable fields to a known allowlist so a malformed
    // value can't corrupt downstream filters.
    if (picked.visibility !== undefined && !ALLOWED_VISIBILITY.has(picked.visibility as string)) {
      return NextResponse.json({ error: "Visibilité invalide" }, { status: 400 });
    }
    if (
      picked.contentRating !== undefined &&
      !ALLOWED_CONTENT_RATING.has(picked.contentRating as string)
    ) {
      return NextResponse.json({ error: "Content rating invalide" }, { status: 400 });
    }
    if (picked.stage !== undefined && !ALLOWED_STAGE.has(picked.stage as string)) {
      return NextResponse.json({ error: "Stage invalide" }, { status: 400 });
    }

    // Publication (published=true) must go through /api/projects/[id]/publish
    // which enforces moderation / admin-review gating.
    if (user.role !== "admin" && (picked as Record<string, unknown>).published !== undefined) {
      return NextResponse.json({ error: "Utilisez /publish pour publier" }, { status: 403 });
    }

    const updated = await updateProject(id, picked);
    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
