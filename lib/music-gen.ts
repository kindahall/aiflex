import "server-only";
import { uploadFromUrl, storagePaths } from "./storage";

/**
 * Original soundtrack generation via Suno (V8 §28.3).
 *
 * Suno V4 produces 30-90s of original music from a text prompt. Cost
 * varies with the plan — ~$0.05-$0.20 per generation on the API tier.
 * Output is royalty-free (generated, no sample clearance).
 *
 * Usage from the agent: at finalize, generate one 60s track per major
 * mood block (typically 1-3 per film). Caller decides whether to mix
 * multiple tracks or repeat a single one. Today we just return the
 * persisted URL — the player handles looping/fading.
 *
 * Falls back gracefully when no SUNO_API_KEY is present.
 */

const API_BASE = "https://api.suno.ai/v1"; // keep configurable below

export interface MusicGenResult {
  skipped: boolean;
  reason?: string;
  audioUrl?: string;
  durationSec?: number;
}

export interface MusicGenParams {
  /** Vibe/mood/style, e.g. "epic orchestral score, rising tension, brass swells". */
  prompt: string;
  /** ISO-2 hint for vocals — defaults to instrumental. */
  vocalsLanguage?: string | null;
  /** Target duration in seconds. Suno produces 30-180. */
  durationSec?: number;
  /** Project this track belongs to — used as the storage key prefix. */
  projectId: string;
  /** Internal label for the storage key (e.g. "main", "credits"). */
  label?: string;
}

export async function generateMusic(
  params: MusicGenParams
): Promise<MusicGenResult> {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "SUNO_API_KEY not configured" };
  }
  const baseUrl = process.env.SUNO_API_URL || API_BASE;

  // 1. Submit
  const submitRes = await fetch(`${baseUrl}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      duration_sec: Math.max(30, Math.min(180, params.durationSec ?? 60)),
      make_instrumental: !params.vocalsLanguage,
      ...(params.vocalsLanguage ? { language: params.vocalsLanguage } : {}),
    }),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(
      `Suno submit failed (${submitRes.status}): ${text.slice(0, 400)}`
    );
  }
  const submitData = (await submitRes.json()) as { id?: string; url?: string };

  // Some Suno deployments return the URL synchronously; others return a
  // job id requiring a poll. Handle both.
  let audioExternalUrl: string | undefined = submitData.url;
  if (!audioExternalUrl && submitData.id) {
    audioExternalUrl = await pollForAudio(baseUrl, apiKey, submitData.id);
  }
  if (!audioExternalUrl) {
    return { skipped: true, reason: "Suno did not return an audio URL" };
  }

  // 2. Persist on our storage so we don't depend on Suno's CDN lifetime
  const label = params.label?.replace(/[^a-z0-9-]/gi, "_") ?? "main";
  const key = `${storagePaths.filmOutput(params.projectId).replace(/\.mp4$/, "")}/music-${label}.mp3`;
  const persistedUrl = await uploadFromUrl(audioExternalUrl, key, "audio/mpeg");

  return {
    skipped: false,
    audioUrl: persistedUrl,
    durationSec: params.durationSec,
  };
}

async function pollForAudio(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  maxWaitMs = 5 * 60 * 1000
): Promise<string | undefined> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${baseUrl}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, 5_000));
      continue;
    }
    const data = (await r.json()) as { status: string; url?: string };
    if (data.status === "completed" && data.url) return data.url;
    if (data.status === "failed") return undefined;
    await new Promise((res) => setTimeout(res, 5_000));
  }
  return undefined;
}
