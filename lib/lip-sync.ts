import "server-only";
import { prisma } from "./prisma";

/**
 * Lip-sync via Sync Labs (sync.so) — V8 §28.2.
 *
 * Use case: when the agent has already generated a Seedance scene clip
 * AND a TTS dialogue track (from lib/voice-cloning), Sync Labs aligns the
 * mouth movements to the spoken audio. Cost ~$0.15/min synchronized.
 *
 * Activated per-scene (`scene.lipSync = true`). Pipeline:
 *   1. Submit job: POST /v2/generate with video URL + audio URL
 *   2. Poll /v2/generate/{id} until status == "COMPLETED"
 *   3. Download the synced video, persist to storage
 *
 * Falls back silently to the un-synced clip if the API call fails — better
 * a clip without lip-sync than a broken render.
 */

const API_BASE = "https://api.sync.so/v2";

export interface LipSyncResult {
  skipped: boolean;
  reason?: string;
  jobId?: string;
  syncedVideoUrl?: string;
}

/**
 * Submit a lip-sync job. Returns a job id that can be polled.
 */
export async function submitLipSync(params: {
  videoUrl: string;
  audioUrl: string;
}): Promise<LipSyncResult> {
  const apiKey = process.env.SYNC_LABS_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "SYNC_LABS_API_KEY not configured" };
  }

  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "lipsync-2",
      input: [
        { type: "video", url: params.videoUrl },
        { type: "audio", url: params.audioUrl },
      ],
      options: { output_format: "mp4" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Sync Labs submit failed (${res.status}): ${text.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as { id: string };
  return { skipped: false, jobId: data.id };
}

export interface LipSyncStatus {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "UNKNOWN";
  outputUrl?: string;
}

export async function checkLipSync(jobId: string): Promise<LipSyncStatus> {
  const apiKey = process.env.SYNC_LABS_API_KEY;
  if (!apiKey) return { status: "UNKNOWN" };
  const res = await fetch(`${API_BASE}/generate/${jobId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) return { status: "UNKNOWN" };
  const data = (await res.json()) as {
    status: string;
    output_url?: string;
  };
  return {
    status:
      data.status === "COMPLETED"
        ? "COMPLETED"
        : data.status === "FAILED"
          ? "FAILED"
          : data.status === "RUNNING"
            ? "RUNNING"
            : "PENDING",
    outputUrl: data.output_url,
  };
}

/**
 * Convenience: submit + poll + persist the synced clip in storage.
 * Mutates `composition.scenes[idx].clipUrl` on the project, or returns an
 * un-changed result if the API isn't reachable.
 *
 * Used by a per-scene worker (cron). Never inline in the orchestrator
 * because a 30s clip can take ~2 minutes to sync.
 */
export async function applyLipSyncToScene(params: {
  projectId: string;
  sceneIndex: number;
  videoUrl: string;
  audioUrl: string;
  maxWaitMs?: number;
}): Promise<LipSyncResult> {
  const submitted = await submitLipSync({
    videoUrl: params.videoUrl,
    audioUrl: params.audioUrl,
  });
  if (submitted.skipped || !submitted.jobId) return submitted;

  const deadline = Date.now() + (params.maxWaitMs ?? 10 * 60 * 1000);
  while (Date.now() < deadline) {
    const status = await checkLipSync(submitted.jobId);
    if (status.status === "COMPLETED" && status.outputUrl) {
      // Persist the synced clip
      const { uploadFromUrl, storagePaths } = await import("./storage");
      const persisted = await uploadFromUrl(
        status.outputUrl,
        storagePaths.filmClip(params.projectId, `${params.sceneIndex}-synced`),
        "video/mp4"
      );
      // Mutate composition.scenes[idx].clipUrl
      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { composition: true },
      });
      const composition = (project?.composition ?? null) as
        | { scenes: Array<{ clipUrl?: string | null }> }
        | null;
      if (composition?.scenes?.[params.sceneIndex]) {
        composition.scenes[params.sceneIndex].clipUrl = persisted;
        await prisma.project.update({
          where: { id: params.projectId },
          data: { composition: composition as unknown as object },
        });
      }
      return {
        skipped: false,
        jobId: submitted.jobId,
        syncedVideoUrl: persisted,
      };
    }
    if (status.status === "FAILED") {
      return { skipped: true, reason: "Sync Labs returned FAILED" };
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return { skipped: true, reason: "Lip-sync timed out" };
}
