import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifyLocalUrl } from "@/lib/local-storage-sign";
import { LOCAL_PRIVATE_DIR } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signed-URL serving endpoint for the LocalStorage dev provider. In
 * production the storage layer uses S3/R2 presigned URLs directly — this
 * route exists so that dev environments don't accidentally ship private
 * films under `/uploads/*` (served unauthenticated by Next.js static).
 */
function contentTypeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".vtt":
      return "text/vtt";
    default:
      return "application/octet-stream";
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  const expStr = req.nextUrl.searchParams.get("exp") || "";
  const sig = req.nextUrl.searchParams.get("sig") || "";
  const exp = Number(expStr);

  if (!key || !sig || !Number.isFinite(exp)) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }
  if (!verifyLocalUrl(key, exp, sig)) {
    return NextResponse.json({ error: "Signature invalide ou expirée" }, { status: 403 });
  }

  // Reject any path traversal attempt before touching the filesystem.
  if (key.includes("..") || key.startsWith("/") || key.includes("\0")) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 400 });
  }

  const abs = path.resolve(LOCAL_PRIVATE_DIR, key);
  if (!abs.startsWith(path.resolve(LOCAL_PRIVATE_DIR) + path.sep)) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(abs);
    const ct = contentTypeFor(path.extname(abs));
    return new NextResponse(data as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": ct,
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }
}
