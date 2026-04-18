import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/parental";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PutBody {
  pin?: string | null;       // 4-8 digits, or null to clear
  curfewHour?: number | null; // 0-23, or null to disable
  isChild?: boolean;
  ageRating?: "kids" | "teens" | "all" | "adult";
}

/**
 * Update the parental controls of a profile (V8 §22.2).
 *
 * Owner of the parent User account only. The PIN is hashed before storage.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as PutBody;

    const profile = await prisma.profile.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }
    if (profile.userId !== user.id) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    if (body.pin === null) {
      data.parentalPin = null;
    } else if (typeof body.pin === "string" && body.pin.length > 0) {
      try {
        data.parentalPin = hashPin(body.pin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PIN invalide";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (body.curfewHour === null) {
      data.curfewHour = null;
    } else if (typeof body.curfewHour === "number") {
      if (body.curfewHour < 0 || body.curfewHour > 23) {
        return NextResponse.json(
          { error: "curfewHour doit être entre 0 et 23" },
          { status: 400 }
        );
      }
      data.curfewHour = Math.floor(body.curfewHour);
    }

    if (typeof body.isChild === "boolean") {
      data.isChild = body.isChild;
    }
    if (body.ageRating && ["kids", "teens", "all", "adult"].includes(body.ageRating)) {
      data.ageRating = body.ageRating;
    }

    const updated = await prisma.profile.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        isChild: true,
        ageRating: true,
        curfewHour: true,
        parentalPin: true,
      },
    });

    // Don't ship the actual hash back
    return NextResponse.json({
      profile: {
        ...updated,
        hasPin: Boolean(updated.parentalPin),
        parentalPin: undefined,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
