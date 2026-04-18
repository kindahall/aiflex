import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  priceForPrivateUpload,
  priceForPublicUpload,
} from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InitBody {
  fileSize: number;
  durationMinutes?: number; // required for public uploads (priced by duration)
  visibility: "private" | "private_circle" | "public";
}

const MAX_BYTES_PUBLIC = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Upload pricing pre-flight (V8 §A5).
 *
 * Lets the UI show the user a firm price BEFORE they upload a 5 GB file
 * over a slow connection only to discover the cost is too high. No
 * persistence — purely a quote endpoint based on the metadata provided.
 *
 * The actual upload + Stripe Checkout creation is in `/api/upload/file`.
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as InitBody;

    if (
      !body.visibility ||
      !["private", "private_circle", "public"].includes(body.visibility)
    ) {
      return NextResponse.json({ error: "Visibilité invalide" }, { status: 400 });
    }
    if (typeof body.fileSize !== "number" || body.fileSize <= 0) {
      return NextResponse.json(
        { error: "Taille de fichier requise" },
        { status: 400 }
      );
    }
    if (body.fileSize > MAX_BYTES_PUBLIC) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 5 GB)" },
        { status: 413 }
      );
    }

    let priceCents: number | null;
    if (body.visibility === "public") {
      if (
        typeof body.durationMinutes !== "number" ||
        body.durationMinutes <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Durée requise pour un upload public (en minutes). L'app peut la mesurer côté navigateur via metadata loadeddata sur le <video>.",
          },
          { status: 400 }
        );
      }
      priceCents = priceForPublicUpload(Math.ceil(body.durationMinutes));
    } else {
      priceCents = priceForPrivateUpload(body.fileSize);
      if (priceCents == null) {
        return NextResponse.json(
          { error: "Fichier plus grand que 5 GB" },
          { status: 413 }
        );
      }
    }

    return NextResponse.json({
      priceCents,
      currency: "usd",
      message:
        body.visibility === "public"
          ? "Upload public — soumis à modération admin avant publication."
          : body.visibility === "private_circle"
            ? "Upload pour ton cercle privé — visible uniquement aux invités."
            : "Upload privé — visible uniquement par toi.",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
