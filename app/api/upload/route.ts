import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { persistUpload } from "@/lib/video-persist";
import { mimeMatches, sniffMime } from "@/lib/file-magic";
import { scanBufferForMalware } from "@/lib/av-scan";
import { isKilled } from "@/lib/kill-switch";

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
    if (isKilled("uploads")) {
      return NextResponse.json({ error: "Uploads temporairement désactivés." }, { status: 503 });
    }
    const user = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 50 Mo)" }, { status: 400 });
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

    // Reject the file if the magic bytes disagree with the declared
    // Content-Type. This is the only way to catch polyglot uploads
    // (attacker sends `Content-Type: image/jpeg` with HTML / JS bytes).
    const sniffed = sniffMime(buffer);
    if (!mimeMatches(file.type, sniffed)) {
      return NextResponse.json(
        {
          error: `Contenu réel du fichier incohérent avec le type déclaré (${file.type}).`,
        },
        { status: 400 }
      );
    }

    // Optional AV scan — no-op unless AV_SCAN_URL is configured, but
    // when enforced blocks upload on any scanner error.
    const av = await scanBufferForMalware(buffer, file.name || "upload");
    if (!av.clean) {
      return NextResponse.json({ error: `Fichier refusé : ${av.reason}` }, { status: 400 });
    }

    // Generate a safe filename with extension — use crypto.randomUUID for
    // higher entropy than Math.random (36^6 ≈ 2G, insufficient at scale).
    const { randomBytes } = await import("node:crypto");
    const rand = randomBytes(16).toString("hex");
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
