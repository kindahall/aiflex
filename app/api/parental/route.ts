import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SetPinBody {
  pin: string;
  maxRating?: "G" | "PG" | "PG-13" | "R";
}

interface VerifyPinBody {
  pin: string;
}

/** GET — return parental control status for current user. */
export async function GET() {
  try {
    const user = await requireUser();
    const record = await findUserById(user.id);
    return NextResponse.json({
      enabled: Boolean(record?.parentalPin),
      maxRating: record?.maxContentRating || "R",
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — set or update parental PIN + max rating. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as SetPinBody;

    if (!body.pin || !/^\d{4,6}$/.test(body.pin)) {
      return NextResponse.json(
        { error: "Le PIN doit contenir 4 à 6 chiffres" },
        { status: 400 }
      );
    }

    const validRatings = ["G", "PG", "PG-13", "R"];
    const maxRating = body.maxRating || "PG-13";
    if (!validRatings.includes(maxRating)) {
      return NextResponse.json(
        { error: "Rating invalide" },
        { status: 400 }
      );
    }

    await updateUser(user.id, {
      parentalPin: body.pin,
      maxContentRating: maxRating,
    });

    return NextResponse.json({ success: true, maxRating });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** PUT — verify PIN (for unlocking restricted content). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as VerifyPinBody;
    const record = await findUserById(user.id);

    if (!record?.parentalPin) {
      return NextResponse.json({ valid: true });
    }

    const valid = record.parentalPin === body.pin;
    return NextResponse.json({ valid });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE — disable parental controls. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as VerifyPinBody;
    const record = await findUserById(user.id);

    if (record?.parentalPin && record.parentalPin !== body.pin) {
      return NextResponse.json({ error: "PIN incorrect" }, { status: 403 });
    }

    await updateUser(user.id, {
      parentalPin: undefined,
      maxContentRating: undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
