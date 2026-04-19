import { NextResponse } from "next/server";
import { generateSceneVideo, hasSeedanceKey } from "@/lib/seedance";
import { AuthError, requireUser } from "@/lib/auth";
import { moderatePromptSafe } from "@/lib/moderation";
import { persistVideo } from "@/lib/video-persist";
import { createJob } from "@/lib/job-queue";
import { assertSafeOutboundUrl } from "@/lib/safe-fetch";
import { getCurrentUsage, getSettings, incrementVideoUsage } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Video generation can take minutes — raise the lambda timeout as high as
// Next.js allows in your deployment target.
export const maxDuration = 300;

interface Body {
  prompt: string;
  durationSec?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "480p" | "720p" | "1080p";
  /** If provided with sceneId, uses the async job queue instead of blocking */
  projectId?: string;
  sceneId?: string;
  /** Set to true to force synchronous mode (legacy behavior) */
  sync?: boolean;
  /** Reference image URLs for character/element consistency across scenes. */
  referenceImageUrls?: string[];
  /** Single image URL for image-to-video mode. */
  imageUrl?: string;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;
    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "Prompt vidéo manquant" }, { status: 400 });
    }

    // Validate any user-provided URLs against the SSRF allowlist BEFORE
    // forwarding them to the upstream model. Providers re-fetch these
    // server-side, which is indistinguishable from us fetching them
    // ourselves for the purposes of SSRF / data-exfiltration.
    try {
      if (body.imageUrl) await assertSafeOutboundUrl(body.imageUrl);
      if (body.referenceImageUrls?.length) {
        if (body.referenceImageUrls.length > 8) {
          return NextResponse.json({ error: "Max 8 images de référence" }, { status: 400 });
        }
        for (const u of body.referenceImageUrls) {
          await assertSafeOutboundUrl(u);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "URL refusée";
      return NextResponse.json({ error: `URL refusée: ${msg}` }, { status: 400 });
    }

    if (!(await hasSeedanceKey())) {
      return NextResponse.json(
        {
          error:
            "FAL_KEY manquant — génération vidéo désactivée. L'app continue avec les visuels statiques.",
          skipped: true,
        },
        { status: 503 }
      );
    }

    // Content moderation — runs before the quota so a rejected prompt
    // doesn't burn the user's monthly quota. Fails open in dev or on
    // Claude outage; see lib/moderation.ts for the policy.
    const moderation = await moderatePromptSafe(body.prompt);
    if (!moderation.allowed) {
      return NextResponse.json(
        {
          error: `Prompt refusé par la modération (${moderation.category || "other"}) : ${moderation.reason || "contenu non autorisé"}`,
          moderation: {
            allowed: false,
            category: moderation.category,
            reason: moderation.reason,
          },
        },
        { status: 422 }
      );
    }

    // Quota check — admin-configured cap on monthly video generations.
    // Admins are exempt to keep moderation/QA workflows unblocked.
    const settings = await getSettings();
    const quota = settings.monthlyVideoQuota || 0;
    if (quota > 0 && user.role !== "admin") {
      const usage = await getCurrentUsage(user.id);
      if (usage.videosGenerated >= quota) {
        return NextResponse.json(
          {
            error: `Quota mensuel atteint (${quota} vidéos / mois). Réessaie le mois prochain ou demande à un admin d'augmenter ton quota.`,
            quotaExceeded: true,
            usage: usage.videosGenerated,
            quota,
          },
          { status: 429 }
        );
      }
    }

    // --- Async mode: if projectId + sceneId provided and not sync ---
    if (body.projectId && body.sceneId && !body.sync) {
      const job = createJob("video-generation", user.id, {
        projectId: body.projectId,
        sceneId: body.sceneId,
        prompt: body.prompt,
        durationSec: body.durationSec,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        referenceImageUrls: body.referenceImageUrls,
        imageUrl: body.imageUrl,
      });

      // Count against quota eagerly for async jobs to prevent over-usage.
      // If the job fails, quota is not refunded (same as sync mode — only
      // successful fal.ai calls are charged, and the handler won't call
      // incrementVideoUsage on failure).
      if (user.role !== "admin") {
        await incrementVideoUsage(user.id, 1);
      }

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        async: true,
        quota: quota || null,
      });
    }

    // --- Synchronous mode (legacy / fallback) ---
    const result = await generateSceneVideo({
      prompt: body.prompt,
      durationSec: body.durationSec,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      referenceImageUrls: body.referenceImageUrls,
      imageUrl: body.imageUrl,
    });

    // Persist the video to cloud storage if configured
    let videoUrl = result.videoUrl;
    if (body.projectId && body.sceneId) {
      try {
        videoUrl = await persistVideo(result.videoUrl, body.projectId, body.sceneId);
      } catch (persistErr) {
        console.warn("[scene-video] Failed to persist video:", persistErr);
        // Fall back to original URL
      }
    }

    // Only count successful generations against the quota — failures are
    // not the user's fault and shouldn't burn their budget.
    const newCount = user.role === "admin" ? null : await incrementVideoUsage(user.id, 1);

    return NextResponse.json({
      videoUrl,
      seed: result.seed,
      usage: newCount,
      quota: quota || null,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
