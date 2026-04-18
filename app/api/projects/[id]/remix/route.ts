import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { createProject, getProjectById } from "@/lib/server-db";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remix a public film. Creates a new private project for the current user
 * that inherits the original's idea + genre + format + tone + concept but
 * starts fresh from the "concept" stage (no scenario, scenes or videos).
 *
 * The idea text is prepended with "Remix de <title> — " so the lineage
 * is visible in the dashboard.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const original = await getProjectById(id);
    if (
      !original ||
      !original.published ||
      original.visibility !== "public" ||
      !original.concept
    ) {
      return NextResponse.json(
        { error: "Film introuvable ou non public" },
        { status: 404 }
      );
    }

    const remix = await createProject({
      ownerId: user.id,
      stage: "concept",
      idea: `Remix de « ${original.concept.title} » — ${original.idea}`,
      genre: original.genre,
      format: original.format,
      tone: original.tone,
      endingHint: original.endingHint,
      concept: {
        ...original.concept,
        title: `${original.concept.title} (remix)`,
      },
      visibility: "private",
      author: user.name,
    });

    // Notify original film owner.
    notify({
      userId: original.ownerId,
      kind: "remix",
      message: `${user.name} a remixé « ${original.concept.title} »`,
      href: `/watch/${id}`,
      actorId: user.id,
      actorName: user.name,
      projectId: id,
    }).catch((e) => console.error("[notification] failed:", e));

    return NextResponse.json({ project: remix });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
