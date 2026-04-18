import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { createProject, listProjectsByOwner } from "@/lib/server-db";
import type { Format, Genre, Tone } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await listProjectsByOwner(user.id);
    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface CreateBody {
  idea: string;
  genre: Genre;
  format: Format;
  tone: Tone;
  endingHint?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as CreateBody;
    if (!body.idea?.trim()) {
      return NextResponse.json(
        { error: "Idée manquante" },
        { status: 400 }
      );
    }
    const project = await createProject({
      ownerId: user.id,
      stage: "idea",
      idea: body.idea.trim(),
      genre: body.genre,
      format: body.format,
      tone: body.tone,
      endingHint: body.endingHint?.trim() || undefined,
      visibility: "private",
      author: user.name,
    });
    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
