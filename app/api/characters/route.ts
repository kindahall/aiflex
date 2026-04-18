import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  createCharacter,
  listCreatorCharacters,
} from "@/lib/character-continuity";
import { listPublicCharacters } from "@/lib/character-marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  ?mine=1     → my characters
 * GET             → public characters (search?, creatorId?, limit?)
 * POST            → create a new character (owner = current user)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("mine") === "1") {
      const user = await requireUser();
      const characters = await listCreatorCharacters(user.id);
      return NextResponse.json({ characters });
    }
    const search = url.searchParams.get("search") ?? undefined;
    const creatorId = url.searchParams.get("creatorId") ?? undefined;
    const limit = Number(url.searchParams.get("limit") || "50");
    const characters = await listPublicCharacters({ search, creatorId, limit });
    return NextResponse.json({ characters });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PostBody {
  name: string;
  description: string;
  fluxPrompt?: string;
  publicChar?: boolean;
  licensePercent?: number;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as PostBody;

    if (!body.name?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: "Nom et description requis" },
        { status: 400 }
      );
    }

    const character = await createCharacter({
      creatorId: user.id,
      name: body.name.trim(),
      description: body.description.trim(),
      fluxPrompt: body.fluxPrompt?.trim(),
      publicChar: body.publicChar,
      licensePercent: body.licensePercent,
    });
    return NextResponse.json({ character });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
