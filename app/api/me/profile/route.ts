import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { toPublicUser, updateUser } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name?: string;
  bio?: string;
  regenerateAvatar?: boolean;
}

/**
 * Self-service edit of the current user's public profile (display name +
 * bio). Email and role can't be changed here — those go through the admin
 * route or a future password-reset / role flow.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;

    const patch: { name?: string; bio?: string; avatarSeed?: string } = {};

    if (body.regenerateAvatar) {
      const { randomBytes } = await import("node:crypto");
      patch.avatarSeed = randomBytes(8).toString("hex");
    }

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 60) {
        return NextResponse.json(
          { error: "Le nom doit faire entre 1 et 60 caractères." },
          { status: 400 }
        );
      }
      patch.name = name;
    }

    if (typeof body.bio === "string") {
      const bio = body.bio.trim();
      if (bio.length > 280) {
        return NextResponse.json(
          { error: "La bio est limitée à 280 caractères." },
          { status: 400 }
        );
      }
      // Empty string clears the bio.
      patch.bio = bio;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Rien à mettre à jour." },
        { status: 400 }
      );
    }

    const updated = await updateUser(user.id, patch);
    if (!updated) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
