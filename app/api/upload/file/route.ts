import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateAndLog } from "@/lib/moderation";
import {
  priceForPrivateUpload,
  priceForPublicUpload,
} from "@/lib/types/film";
import { probeDurationSeconds } from "@/lib/video-probe";
import { getStorage, storagePaths } from "@/lib/storage";
import { createOneShotCheckout } from "@/lib/stripe-oneshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next.js caps default body at 1MB for /api; we handle larger via stream.
export const maxDuration = 600; // 10 min per upload

const MAX_BYTES_PUBLIC = 5 * 1024 * 1024 * 1024; // 5 GB hard cap
const ALLOWED_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
]);

/**
 * Create a user upload (V7 §7).
 *
 * Multipart payload fields:
 *   - file           (required) the video file
 *   - title          (required)
 *   - synopsis
 *   - genre
 *   - visibility     "private" | "private_circle" | "public"
 *   - invitedEmails  JSON array of emails (only when visibility = private_circle)
 *
 * Flow:
 *   1. Auth + parse multipart
 *   2. Content-type whitelist + size cap check
 *   3. Moderate title + synopsis (fail-open on missing key)
 *   4. Write file to a temp dir, probe duration
 *   5. Compute price (private: size-based / public: duration-based)
 *   6. Upload to storage → canonical path
 *   7. Create Project row with status = "awaiting_payment" (public) or ready (private)
 *   8. Return Stripe Checkout URL → webhook activates the row
 */
export async function POST(req: Request) {
  let tmpPath: string | null = null;
  try {
    const user = await requireUser();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    const rawName = (form.get("originalFileName") as string) || "video.mp4";
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Type de fichier non supporté (${contentType})` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES_PUBLIC) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 5 GB)" },
        { status: 413 }
      );
    }

    const title = ((form.get("title") as string) || "").trim();
    const synopsis = ((form.get("synopsis") as string) || "").trim();
    const genre = ((form.get("genre") as string) || "drama").trim();
    const visibility = ((form.get("visibility") as string) ||
      "private") as "private" | "private_circle" | "public";
    const invitedRaw = (form.get("invitedEmails") as string) || "[]";
    let invitedEmails: string[] = [];
    try {
      invitedEmails = JSON.parse(invitedRaw);
      if (!Array.isArray(invitedEmails)) invitedEmails = [];
    } catch {
      invitedEmails = [];
    }

    if (!title) {
      return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    }

    // Moderate the text fields (title + synopsis). The video itself is
    // reviewed by a human in /admin/reviews — CSAM detection is the admin's
    // responsibility here; we just pre-filter the metadata.
    const textToModerate = `${title}\n\n${synopsis}`;
    const mod = await moderateAndLog(prisma, {
      userId: user.id,
      content: textToModerate,
      kind: "upload-desc",
    });
    if (!mod.allowed) {
      return NextResponse.json(
        {
          error: `Contenu refusé par la modération : ${mod.reason || "non conforme"}`,
        },
        { status: 400 }
      );
    }

    // 4. Persist to a temp file so ffprobe can read it
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aiflex-upload-"));
    tmpPath = path.join(tmpDir, rawName.replace(/[^A-Za-z0-9._-]/g, "_"));
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buf);

    const durationSec = await probeDurationSeconds(tmpPath);
    const durationMinutes =
      durationSec != null ? Math.max(1, Math.ceil(durationSec / 60)) : null;

    // 5. Price
    let priceCents: number | null;
    if (visibility === "public") {
      // Public upload pricing depends on duration. If ffprobe unavailable,
      // reject — we don't want to mispeice at risk of free gigabytes.
      if (!durationMinutes) {
        return NextResponse.json(
          {
            error:
              "Impossible de mesurer la durée du fichier. Installe ffprobe sur le serveur ou convertis en MP4 standard.",
          },
          { status: 400 }
        );
      }
      priceCents = priceForPublicUpload(durationMinutes);
    } else {
      priceCents = priceForPrivateUpload(file.size);
      if (priceCents == null) {
        return NextResponse.json(
          { error: "Fichier plus grand que 5 GB" },
          { status: 413 }
        );
      }
    }

    // 6. Upload to storage
    const projectId = `upl_${crypto.randomBytes(12).toString("base64url")}`;
    const storageKey = storagePaths.uploadedFilm(projectId);
    const storage = getStorage();
    const outputUrl = await storage.upload(storageKey, buf, contentType);

    // Private-circle: generate an invite token for share links
    const inviteToken =
      visibility === "private_circle"
        ? crypto.randomBytes(24).toString("base64url")
        : null;

    // 7. Draft project — awaiting_payment is a stopgap status, flipped by
    //    the Stripe webhook to pending_review (public) or ready (private)
    const project = await prisma.project.create({
      data: {
        id: projectId,
        ownerId: user.id,
        stage: "ready",
        idea: synopsis || title,
        genre,
        format: "user_upload",
        tone: "cinematic",
        uploadType: "user_upload",
        title,
        synopsis,
        visibility,
        status: "pending", // flipped by webhook
        outputUrl,
        fileSize: BigInt(file.size),
        originalFileName: rawName,
        durationMinutes: durationMinutes ?? null,
        amountPaid: priceCents,
        inviteToken,
        invitedEmails,
        adminReviewStatus: visibility === "public" ? "pending_review" : null,
      },
    });

    // 8. For private uploads, no Stripe checkout — flat rate still charged
    //    via a one-shot session so every billable action goes through the
    //    same rail. (Alternative: wrap in subscription credits.)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const checkoutUrl = await createOneShotCheckout({
      kind: "upload",
      userId: user.id,
      amountCents: priceCents,
      description: `Upload ${visibility === "public" ? "public" : "privé"} — ${title}`,
      successUrl: `${appUrl}/watch/${project.id}?upload=success`,
      cancelUrl: `${appUrl}/studio?upload=cancel`,
      customerEmail: user.email,
      metadata: {
        projectId: project.id,
      },
    });

    return NextResponse.json({
      projectId: project.id,
      priceCents,
      checkoutUrl,
      durationMinutes,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[upload/file]", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpPath) {
      try {
        await fs.rm(path.dirname(tmpPath), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
