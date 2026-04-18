import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { prisma } from "./prisma";
import { getStorage, storagePaths, uploadFromUrl } from "./storage";
import { callNarrativeJSON } from "./ai-client";

/**
 * Automatic multilingual subtitle pipeline (V8 §22.6).
 *
 * Flow per public film:
 *   1. Download final MP4 from storage
 *   2. Call OpenAI Whisper (`whisper-1`) to get a source-language WebVTT
 *   3. Persist the source VTT on storage + Subtitle row (auto=true)
 *   4. For each target language, ask Claude to translate the VTT in bulk
 *      (preserves timestamps), save + create Subtitle row
 *
 * Target languages are the 10 most relevant for AiFlex's audience:
 *   en, fr, es, de, it, pt, ja, ko, ar, zh
 *
 * Skips silently if OpenAI key is missing — callers log a warning via
 * observability but don't fail the render.
 */

const TARGET_LANGUAGES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "ja",
  "ko",
  "ar",
  "zh",
] as const;

type Lang = (typeof TARGET_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface GenerateSubtitlesResult {
  skipped: boolean;
  reason?: string;
  sourceLang?: string;
  translatedLangs?: Lang[];
}

/**
 * Generate and persist subtitles for a project. Idempotent: existing
 * Subtitle rows with matching (projectId, lang) are updated in place.
 *
 * Used by `step_finalize` of the agent as fire-and-forget for public AI
 * films, and by the `/api/subtitles/generate/[projectId]` endpoint for
 * manual regeneration.
 */
export async function generateSubtitlesForProject(
  projectId: string,
  targetLangs: readonly Lang[] = TARGET_LANGUAGES
): Promise<GenerateSubtitlesResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, outputUrl: true, title: true },
  });
  if (!project?.outputUrl) {
    return { skipped: true, reason: "Project has no outputUrl yet" };
  }

  const client = openaiClient();
  if (!client) {
    return { skipped: true, reason: "OpenAI key not configured" };
  }

  // 1. Download the MP4, extract mono 64 kbps MP3 audio (way smaller than
  //    the video), then chunk to <24 MB segments if needed. Whisper's
  //    25 MB cap applies per call, so we transcribe each chunk with
  //    `verbose_json` + offset every segment's timestamp by the chunk's
  //    start-second before stitching everything into one VTT.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aiflex-subs-"));
  const videoPath = path.join(tmpDir, `${projectId}.mp4`);
  const audioPath = path.join(tmpDir, `${projectId}.mp3`);
  try {
    const resp = await fetch(project.outputUrl);
    if (!resp.ok) {
      throw new Error(`download failed (${resp.status})`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(videoPath, buf);

    const extracted = await extractAudioMp3(videoPath, audioPath);
    if (!extracted.ok) {
      return { skipped: true, reason: extracted.reason };
    }

    const chunkPaths = await chunkAudioIfNeeded(audioPath, tmpDir);

    // 2. Transcribe each chunk → verbose_json segments, offset, stitch
    let sourceLang: Lang = "en";
    const allSegments: TranscriptSegment[] = [];
    let offsetSec = 0;
    for (const chunk of chunkPaths) {
      const chunkBuf = await fs.readFile(chunk.path);
      const file = new File([chunkBuf], path.basename(chunk.path), {
        type: "audio/mpeg",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail: any = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
      });
      const detected = (detail?.language as string | undefined)?.slice(0, 2);
      if (
        detected &&
        (TARGET_LANGUAGES as readonly string[]).includes(detected) &&
        allSegments.length === 0
      ) {
        sourceLang = detected as Lang;
      }
      const segments = (detail?.segments as TranscriptSegment[] | undefined) ?? [];
      for (const seg of segments) {
        allSegments.push({
          start: seg.start + offsetSec,
          end: seg.end + offsetSec,
          text: seg.text,
        });
      }
      offsetSec += chunk.durationSec;
    }

    if (allSegments.length === 0) {
      return { skipped: true, reason: "Whisper returned no segments" };
    }

    const sourceVtt = segmentsToVtt(allSegments);

    // 3. Persist source VTT
    await persistVtt(projectId, sourceLang, sourceVtt);

    // 4. Translate to the other target languages via Claude.
    //    We skip the source language and any lang the user already has.
    const translatedLangs: Lang[] = [];
    for (const lang of targetLangs) {
      if (lang === sourceLang) continue;
      try {
        const translated = await translateVtt(sourceVtt, sourceLang, lang);
        await persistVtt(projectId, lang, translated);
        translatedLangs.push(lang);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[subtitles] translation ${sourceLang}→${lang} failed:`, err);
      }
    }

    return { skipped: false, sourceLang, translatedLangs };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Translation via Claude (preserves VTT timestamps)
// ---------------------------------------------------------------------------

const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  zh: "Simplified Chinese",
};

async function translateVtt(
  sourceVtt: string,
  sourceLang: Lang,
  targetLang: Lang
): Promise<string> {
  const prompt = `You are translating a WebVTT subtitle file from ${LANG_LABELS[sourceLang]} to ${LANG_LABELS[targetLang]}.

STRICT RULES:
- Preserve every timestamp line EXACTLY (e.g. "00:00:01.200 --> 00:00:04.500").
- Preserve the WEBVTT header and cue numbering.
- Only translate the text under each cue.
- Keep the natural spoken rhythm — shorter lines are better.
- If a line in the source is only a sound effect in brackets (e.g. "[music]"), translate the descriptor, not invent dialogue.

Return ONLY the translated VTT file, nothing else — no preface, no code fences.

SOURCE VTT:
${sourceVtt}`;

  const out = await callNarrativeJSON(prompt);
  // Strip any code fence if the model ignored instructions
  let clean = out.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:vtt|webvtt)?\s*/i, "").replace(/```\s*$/, "");
  }
  if (!/^WEBVTT/i.test(clean)) {
    clean = `WEBVTT\n\n${clean}`;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Storage + DB persistence
// ---------------------------------------------------------------------------

async function persistVtt(
  projectId: string,
  lang: Lang,
  vtt: string
): Promise<void> {
  const key = storagePaths.subtitle(projectId, lang);
  const url = await getStorage().upload(
    key,
    Buffer.from(vtt, "utf-8"),
    "text/vtt; charset=utf-8"
  );
  await prisma.subtitle.upsert({
    where: { projectId_lang: { projectId, lang } },
    update: { url, auto: true },
    create: { projectId, lang, url, auto: true },
  });
}

// ---------------------------------------------------------------------------
// OpenAI client — shared with embeddings, kept here locally for clarity
// ---------------------------------------------------------------------------

let _client: { key: string; client: OpenAI } | null = null;

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  if (_client?.key === key) return _client.client;
  const client = new OpenAI({ apiKey: key });
  _client = { key, client };
  return client;
}

// ---------------------------------------------------------------------------
// ffmpeg audio extraction + chunking (V8 §22.6 — long-form support)
// ---------------------------------------------------------------------------

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface AudioChunk {
  path: string;
  durationSec: number;
}

// Whisper cap is 25 MB; stay under 24 to leave room for multipart overhead.
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
// 10-minute chunks at 64 kbps mono ≈ 4.8 MB — comfortably under the cap.
const CHUNK_SECONDS = 600;

async function extractAudioMp3(
  videoPath: string,
  audioPath: string
): Promise<{ ok: boolean; reason?: string }> {
  const bin = process.env.FFMPEG_BIN || "ffmpeg";
  try {
    await runFfmpeg(bin, [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1", // mono
      "-ar",
      "16000", // 16 kHz — Whisper's native sample rate
      "-b:a",
      "64k",
      "-f",
      "mp3",
      audioPath,
    ]);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: `ffmpeg audio extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function chunkAudioIfNeeded(
  audioPath: string,
  tmpDir: string
): Promise<AudioChunk[]> {
  const stat = await fs.stat(audioPath);
  if (stat.size <= WHISPER_MAX_BYTES) {
    const durationSec = await probeDuration(audioPath);
    return [{ path: audioPath, durationSec }];
  }

  // Split into fixed-duration chunks via `-f segment`.
  const bin = process.env.FFMPEG_BIN || "ffmpeg";
  const pattern = path.join(tmpDir, "chunk-%03d.mp3");
  await runFfmpeg(bin, [
    "-y",
    "-i",
    audioPath,
    "-f",
    "segment",
    "-segment_time",
    String(CHUNK_SECONDS),
    "-c",
    "copy",
    pattern,
  ]);

  const files = (await fs.readdir(tmpDir))
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".mp3"))
    .sort();
  const chunks: AudioChunk[] = [];
  for (const f of files) {
    const full = path.join(tmpDir, f);
    const durationSec = await probeDuration(full);
    chunks.push({ path: full, durationSec });
  }
  return chunks;
}

async function probeDuration(file: string): Promise<number> {
  const bin = process.env.FFPROBE_BIN || "ffprobe";
  try {
    const stdout = await runCapture(bin, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : CHUNK_SECONDS;
  } catch {
    return CHUNK_SECONDS;
  }
}

function segmentsToVtt(segments: TranscriptSegment[]): string {
  const lines: string[] = ["WEBVTT", ""];
  segments.forEach((seg, i) => {
    const text = seg.text.trim();
    if (!text) return;
    lines.push(String(i + 1));
    lines.push(`${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}`);
    lines.push(text);
    lines.push("");
  });
  return lines.join("\n");
}

function formatVttTime(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0") +
    "." +
    String(ms).padStart(3, "0")
  );
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${bin} exit ${code}${stderr ? `: ${stderr.slice(-400)}` : ""}`)
        );
    });
  });
}

function runCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

// Kept for when we add Replicate-based transcription for long-form films
export { TARGET_LANGUAGES, uploadFromUrl };
