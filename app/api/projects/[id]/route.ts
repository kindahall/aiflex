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
  "targetFps",
  "lutPreset",
  "masterCodec",
  "colorSpace",
  "hdrPeakNits",
  "audioLayout",
  "surroundCodec",
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
const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_LUT = new Set([
  "none",
  "cinema",
  "noir",
  "teal-orange",
  "desat",
  "warm",
  "aces-rec709",
  "aces-rec2020",
  "aces-pq1000",
  "aces-v2-rec709-true",
  "aces-v2-p3-true",
  "aces-v2-pq1000-true",
  "aces-v2-pq4000-true",
]);
const ALLOWED_MASTER_CODEC = new Set(["prores", "dnxhr"]);
const ALLOWED_COLOR_SPACE = new Set(["sdr", "hdr10"]);
const ALLOWED_HDR_PEAK_NITS = new Set([600, 1000, 4000, 10000]);
const ALLOWED_AUDIO_LAYOUT = new Set([
  "stereo",
  "5.1",
  "7.1",
  "ambisonic",
  "ambisonic-hoa2",
  "ambisonic-hoa3",
  "atmos",
  "atmos-stub",
]);
const ALLOWED_SURROUND_CODEC = new Set(["ac3", "eac3"]);
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
    if (picked.targetFps !== undefined && !ALLOWED_FPS.has(picked.targetFps as number)) {
      return NextResponse.json({ error: "Framerate invalide (24, 30 ou 60)" }, { status: 400 });
    }
    if (picked.lutPreset !== undefined && !ALLOWED_LUT.has(picked.lutPreset as string)) {
      return NextResponse.json({ error: "LUT preset invalide" }, { status: 400 });
    }
    if (
      picked.masterCodec !== undefined &&
      picked.masterCodec !== null &&
      !ALLOWED_MASTER_CODEC.has(picked.masterCodec as string)
    ) {
      return NextResponse.json({ error: "Master codec invalide" }, { status: 400 });
    }
    if (
      picked.colorSpace !== undefined &&
      picked.colorSpace !== null &&
      !ALLOWED_COLOR_SPACE.has(picked.colorSpace as string)
    ) {
      return NextResponse.json({ error: "Color space invalide" }, { status: 400 });
    }
    if (
      picked.hdrPeakNits !== undefined &&
      picked.hdrPeakNits !== null &&
      !ALLOWED_HDR_PEAK_NITS.has(picked.hdrPeakNits as number)
    ) {
      return NextResponse.json(
        { error: "Peak luminance invalide (600, 1000, 4000 ou 10000)" },
        { status: 400 }
      );
    }
    if (
      picked.audioLayout !== undefined &&
      picked.audioLayout !== null &&
      !ALLOWED_AUDIO_LAYOUT.has(picked.audioLayout as string)
    ) {
      return NextResponse.json({ error: "Audio layout invalide" }, { status: 400 });
    }
    if (
      picked.surroundCodec !== undefined &&
      picked.surroundCodec !== null &&
      !ALLOWED_SURROUND_CODEC.has(picked.surroundCodec as string)
    ) {
      return NextResponse.json({ error: "Codec surround invalide" }, { status: 400 });
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
