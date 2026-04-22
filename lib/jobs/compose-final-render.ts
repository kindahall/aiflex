import "server-only";
import { registerHandler, type Job } from "../job-queue";
import { composeProject } from "../video-compose";
import { findUserById, getProjectById } from "../server-db";
import { getAtmosQuotaForUser, getPlanForUser } from "../plans";
import { checkPlanAccess } from "../plan-gate";
import { getCurrentUsage, incrementAtmosMinutesUsed } from "../db-adapter";
import { notify } from "../notify";
import type { Scene, User, UserRecord } from "../types";

/**
 * Job handler for the final server-side render (Wave 1.1).
 *
 * Payload:
 *   projectId: string
 *   width?: number
 *   height?: number
 *   fps?: number
 *   preUpscale?: 2 | 4  // honest 4K/8K by upscaling clips before compose
 */
async function handleComposeFinalRender(
  job: Job,
  updateProgress: (pct: number) => void
): Promise<{
  outputUrl: string;
  masterUrl?: string;
  durationSec: number;
  warnings: string[];
}> {
  const { projectId, width, height, fps, preUpscale, masterCodec } = job.payload as {
    projectId: string;
    width?: number;
    height?: number;
    fps?: number;
    preUpscale?: 2 | 4;
    masterCodec?: "prores" | "dnxhr";
  };

  if (!projectId) throw new Error("Missing projectId");

  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  updateProgress(2);

  // Quality tier from the project owner's plan: Studio/Family ship a slower
  // preset and a lower CRF (better quality); Pro and Free stay on the
  // streaming-friendly defaults. Admins follow their own plan (usually
  // highest).
  const owner = await findUserById(project.ownerId);
  const planId = owner ? getPlanForUser(owner as User & Partial<UserRecord>).id : "free";
  const qualityTier =
    planId === "studio" || planId === "family"
      ? { crf: 14 as const, preset: "slow" as const }
      : planId === "pro"
        ? { crf: 18 as const, preset: "medium" as const }
        : { crf: 20 as const, preset: "medium" as const };

  // Master export + HDR10 gated to Studio/Family tiers. Free/Pro get SDR
  // H.264 regardless of what the project has set (silently downgraded).
  const canStudio = planId === "studio" || planId === "family";
  const effectiveMaster = canStudio ? masterCodec : undefined;
  const effectiveColor = canStudio ? project.colorSpace : "sdr";

  // --- Dolby Atmos cloud gate (plan + monthly minutes quota) ----------
  // Real Atmos transcode (provider "dolbyio") bills ~$0.30/min. Without a
  // gate, a single Free user could torch the Dolby.io bill with an all-
  // nighter of renders. Two guardrails:
  //   1. Plan gate — only Studio+ can request real Atmos. Anything else
  //      downgrades transparently to atmos-stub (FOSS 5.1 E-AC-3 with
  //      Atmos-compatible signalling metadata, no cloud cost).
  //   2. Monthly minutes quota — even Studio users cap at N minutes per
  //      month. Estimate the minutes the render will consume based on the
  //      sum of scene durations, check against `quota - atmosMinutesUsed`,
  //      and refuse above the line. We charge the counter UP FRONT before
  //      submitting the job so a crash mid-transcode doesn't leak free
  //      minutes via retry.
  let audioLayoutOverride: NonNullable<Parameters<typeof composeProject>[1]>["audioLayoutOverride"];
  const prelimWarnings: string[] = [];

  if (project.audioLayout === "atmos") {
    const planGate = await checkPlanAccess(project.ownerId, "atmos-real");
    if (!planGate.allowed) {
      audioLayoutOverride = "atmos-stub";
      prelimWarnings.push(
        `Dolby Atmos cloud requires the ${planGate.requiredPlan} plan — downgraded to atmos-stub (5.1 E-AC-3) for this render.`
      );
    } else if (owner) {
      const estMinutes = estimateAtmosMinutes(project.scenes);
      const usage = await getCurrentUsage(project.ownerId);
      const quota = getAtmosQuotaForUser(owner as User & Partial<UserRecord>);
      const remaining = Math.max(0, quota - (usage.atmosMinutesUsed ?? 0));
      if (estMinutes > remaining) {
        audioLayoutOverride = "atmos-stub";
        prelimWarnings.push(
          `Dolby Atmos monthly quota reached (${usage.atmosMinutesUsed}/${quota} min used, ${estMinutes} needed) — downgraded to atmos-stub for this render.`
        );
      } else {
        // Charge the counter BEFORE launching compose so a retry after a
        // crash doesn't billed-twice the minutes. Accepting the small
        // over-count risk on the upside (aborted jobs still count) for
        // safety on the cost side.
        await incrementAtmosMinutesUsed(project.ownerId, estMinutes);
      }
    }
  }

  // Final renders always use 2-pass loudnorm for broadcast-grade -14 LUFS
  // precision (adds 1 extra FFmpeg invocation per scene). Preview renders
  // should pass twoPassLoudnorm=false to stay fast.
  const result = await composeProject(projectId, {
    width,
    height,
    fps,
    preUpscale,
    crf: qualityTier.crf,
    preset: qualityTier.preset,
    masterCodec: effectiveMaster,
    colorSpace: effectiveColor,
    audioLayoutOverride,
    twoPassLoudnorm: true,
    onProgress: (pct) => updateProgress(Math.min(99, Math.max(2, pct))),
  });

  updateProgress(100);

  notify({
    userId: project.ownerId,
    kind: "video-ready",
    message: `Film composé et prêt à publier (${Math.round(result.durationSec)}s)`,
    href: `/studio/${projectId}`,
    projectId,
  }).catch(() => {});

  return {
    outputUrl: result.outputUrl,
    masterUrl: result.masterUrl,
    durationSec: result.durationSec,
    warnings: [...prelimWarnings, ...result.warnings],
  };
}

/**
 * Estimate the Atmos minutes a render will consume, based on the scene
 * durations declared in the project. Billed in whole minutes rounded up
 * (Dolby.io charges per output minute; a 12-second clip costs as much as
 * a 60-second one on the lowest billing tier). Returns 0 when no scene
 * carries a duration — better to refuse the charge than guess.
 */
function estimateAtmosMinutes(scenes: Scene[] | undefined): number {
  if (!scenes || scenes.length === 0) return 0;
  const totalSec = scenes.reduce((acc, s) => {
    const d = typeof s.durationSec === "number" && s.durationSec > 0 ? s.durationSec : 0;
    return acc + d;
  }, 0);
  if (totalSec <= 0) return 0;
  return Math.ceil(totalSec / 60);
}

export function registerComposeFinalRenderHandler(): void {
  registerHandler("compose-final-render", handleComposeFinalRender);
}
