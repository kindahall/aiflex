import "server-only";
import { prisma } from "./prisma";
import { uploadFromUrl, storagePaths } from "./storage";

/**
 * Automatic dubbing via ElevenLabs Multilingual v2 (V8 §22.7).
 *
 * ElevenLabs offers two APIs:
 *   - Dubbing Studio    (long-form, async job, ~$0.30/min)
 *   - Speech-to-speech  (short clips, synchronous)
 *
 * We use Dubbing Studio for full films. Flow:
 *   1. POST /v1/dubbing with source MP4 URL + target language
 *   2. Poll GET /v1/dubbing/{dubbing_id} until status == "dubbed"
 *   3. GET /v1/dubbing/{dubbing_id}/audio/{target_lang} → audio stream
 *   4. Persist to storage, create Dub row
 *
 * Creator-opt-in (V8 §22.7): not automatic. Creators trigger from
 * /api/dubbing/generate with a specific target language. First run free
 * per creator; subsequent runs billed via CreatorPlan usage.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

export interface DubResult {
  skipped: boolean;
  reason?: string;
  dubbingId?: string;
  targetLang?: string;
  audioUrl?: string;
}

/**
 * Kick off dubbing for a project. Returns the ElevenLabs dubbing_id; the
 * caller (cron) polls `checkDubbingStatus` until done then pulls the
 * audio via `finalizeDub`.
 */
export async function startDubbing(
  projectId: string,
  targetLang: string
): Promise<DubResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "ELEVENLABS_API_KEY not set" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { outputUrl: true },
  });
  if (!project?.outputUrl) {
    return { skipped: true, reason: "Project has no outputUrl" };
  }

  const form = new FormData();
  form.append("source_url", project.outputUrl);
  form.append("target_lang", targetLang);
  form.append("mode", "automatic");

  const res = await fetch(`${API_BASE}/dubbing`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs dubbing create failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as { dubbing_id: string };
  return {
    skipped: false,
    dubbingId: data.dubbing_id,
    targetLang,
  };
}

export interface DubbingStatus {
  status: "queued" | "dubbing" | "dubbed" | "failed" | "unknown";
  expectedDurationSec?: number;
}

export async function checkDubbingStatus(
  dubbingId: string
): Promise<DubbingStatus> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { status: "unknown" };
  const res = await fetch(`${API_BASE}/dubbing/${dubbingId}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return { status: "unknown" };
  const data = (await res.json()) as {
    status: string;
    expected_duration_sec?: number;
  };
  return {
    status:
      data.status === "dubbed"
        ? "dubbed"
        : data.status === "dubbing"
          ? "dubbing"
          : data.status === "failed"
            ? "failed"
            : "queued",
    expectedDurationSec: data.expected_duration_sec,
  };
}

/**
 * Once a dubbing job is complete, fetch the MP3 and persist it as a Dub
 * row for the player to surface as an alt audio track.
 */
export async function finalizeDub(
  projectId: string,
  dubbingId: string,
  targetLang: string
): Promise<DubResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "ELEVENLABS_API_KEY not set" };
  }

  const audioEndpoint = `${API_BASE}/dubbing/${dubbingId}/audio/${targetLang}`;
  // Persist via re-upload — uploadFromUrl honors our headers via a re-fetch,
  // so here we fetch ourselves with auth then upload the buffer.
  const res = await fetch(audioEndpoint, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`ElevenLabs audio fetch failed (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Upload to our storage
  const { getStorage } = await import("./storage");
  const key = storagePaths.dubAudio(projectId, targetLang);
  const url = await getStorage().upload(key, buf, "audio/mpeg");

  await prisma.dub.upsert({
    where: { projectId_lang: { projectId, lang: targetLang } },
    update: { audioUrl: url },
    create: { projectId, lang: targetLang, audioUrl: url },
  });

  return { skipped: false, dubbingId, targetLang, audioUrl: url };
}

/**
 * Convenience synchronous-ish wrapper: start + poll + finalize. Should
 * only be called from a long-running worker (or /api/dubbing/cron-check),
 * never from an HTTP route — a 90-min film takes 5-15 minutes to dub.
 */
export async function dubProjectAndWait(
  projectId: string,
  targetLang: string,
  maxWaitMs = 30 * 60 * 1000
): Promise<DubResult> {
  const start = await startDubbing(projectId, targetLang);
  if (start.skipped || !start.dubbingId) return start;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const status = await checkDubbingStatus(start.dubbingId);
    if (status.status === "dubbed") {
      return finalizeDub(projectId, start.dubbingId, targetLang);
    }
    if (status.status === "failed") {
      return { skipped: true, reason: "ElevenLabs returned failed status" };
    }
    await new Promise((r) => setTimeout(r, 30_000)); // poll every 30s
  }
  return { skipped: true, reason: "Timed out waiting for dubbing" };
}

// Unused but exported to keep the import chain clean with uploadFromUrl
export { uploadFromUrl };
