import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getStorage } from "./storage";
import { applyAiWatermarkInPlace } from "./watermark";

/**
 * Download a video from an external URL (e.g. fal.media) and persist it
 * to the configured storage backend. Returns the persistent URL.
 */
export async function persistVideo(
  videoUrl: string,
  projectId: string,
  sceneId: string
): Promise<string> {
  const storage = getStorage();
  const key = `videos/${projectId}/${sceneId}.mp4`;

  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download video from ${videoUrl}: ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const persistentUrl = await storage.upload(key, buffer, "video/mp4");

  return persistentUrl;
}

/**
 * Download a video, apply the AI-disclosure watermark (V8 §19.2), and
 * persist to storage. Use this in the generation pipeline for every scene
 * clip of a project whose final visibility will be public. Falls back to
 * the raw file if ffmpeg is unavailable — caller gets a warning-log but
 * the render isn't blocked.
 */
export async function persistVideoWithAiWatermark(
  videoUrl: string,
  projectId: string,
  sceneId: string
): Promise<string> {
  const storage = getStorage();
  const key = `videos/${projectId}/${sceneId}.mp4`;

  // 1. Fetch to a temp file on disk (watermark filter needs a local path)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aiflex-wm-"));
  const tmpPath = path.join(tmpDir, `${sceneId}.mp4`);

  try {
    const resp = await fetch(videoUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download video from ${videoUrl}: ${resp.status}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    // 2. Apply watermark in place (no-op gracefully if ffmpeg missing)
    const result = await applyAiWatermarkInPlace(tmpPath);
    if (result.skipped) {
      // eslint-disable-next-line no-console
      console.warn(
        `[video-persist] watermark skipped for ${projectId}/${sceneId}: ${result.reason}`
      );
    }

    // 3. Best-effort C2PA signature (V8 §19.3) — no-op gracefully if
    // c2patool/cert/key not configured. Computes a sha256 of the project
    // id + scene id as the prompt-hash placeholder; agent.ts can pass a
    // proper one once we hook the signing into the assembly step.
    try {
      const { signC2PA } = await import("./watermark");
      const crypto = await import("node:crypto");
      const promptHash = crypto
        .createHash("sha256")
        .update(`${projectId}:${sceneId}`)
        .digest("hex");
      await signC2PA(tmpPath, {
        creatorUserId: "system",
        filmId: projectId,
        model: "fal-seedance",
        generatedAt: new Date(),
        promptHash,
      });
    } catch {
      /* fail-soft */
    }

    // 4. Upload the (hopefully watermarked + signed) file
    const finalBuffer = await fs.readFile(tmpPath);
    const persistentUrl = await storage.upload(key, finalBuffer, "video/mp4");
    return persistentUrl;
  } finally {
    // cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Persist a user-uploaded file to storage.
 * Returns the persistent URL.
 */
export async function persistUpload(
  file: Buffer,
  filename: string,
  userId: string,
  contentType: string
): Promise<string> {
  const storage = getStorage();
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `uploads/${userId}/${timestamp}_${safeName}`;

  const persistentUrl = await storage.upload(key, file, contentType);
  return persistentUrl;
}
