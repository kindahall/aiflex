import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { persistUpload } from "@/lib/video-persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * File upload endpoint for the studio. Uses the storage abstraction layer
 * so files go to local disk in dev and S3/R2 in production.
 *
 * Accepts: images (jpg, png, webp) and videos (mp4, webm).
 * Max size: 50 MB.
 */

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 50 Mo)" },
        { status: 400 }
      );
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        {
          error: `Type de fichier non supporté (${file.type}). Acceptés : JPG, PNG, WebP, MP4, WebM.`,
        },
        { status: 400 }
      );
    }

    // Read file into buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate a safe filename with extension
    const rand = Math.random().toString(36).slice(2, 8);
    const safeName = `${rand}${ext}`;

    // Upload via storage abstraction (local in dev, S3/R2 in production)
    const url = await persistUpload(buffer, safeName, user.id, file.type);

    return NextResponse.json({
      url,
      filename: safeName,
      type: file.type.startsWith("image/") ? "image" : "video",
      size: file.size,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
