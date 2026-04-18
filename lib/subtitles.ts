import type { Scene, SubtitleEntry } from "./types";

/**
 * Rule-based subtitle generation from scene dialogue and action text.
 * Splits dialogue into timed entries that fit within the scene duration.
 */

/** Average reading speed in characters per second. */
const CHARS_PER_SEC = 15;
/** Minimum subtitle display duration in seconds. */
const MIN_DURATION = 1.5;
/** Maximum subtitle display duration in seconds. */
const MAX_DURATION = 6;
/** Maximum characters per subtitle line. */
const MAX_CHARS = 80;

/**
 * Generate subtitle entries from a scene's dialogue and action text.
 * Uses simple heuristics: splits on sentence boundaries, assigns timing
 * based on text length and scene duration.
 */
export function generateSubtitlesForScene(scene: Scene): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  const duration = scene.durationSec || 6;

  // Parse dialogue lines: "CHARACTER: text" or plain text
  const dialogueLines = parseDialogueLines(scene.dialogue || "");
  // Also include action text as descriptive subtitles (in brackets)
  const actionLines = parseActionLines(scene.action || "");

  const allLines = [...dialogueLines, ...actionLines];
  if (allLines.length === 0) return entries;

  // Distribute time proportionally based on text length
  const totalChars = allLines.reduce((sum, l) => sum + l.text.length, 0);
  let cursor = 0;

  for (const line of allLines) {
    const proportion = totalChars > 0 ? line.text.length / totalChars : 1 / allLines.length;
    const rawDuration = proportion * duration;
    const entryDuration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, rawDuration));
    const startSec = Math.min(cursor, duration - MIN_DURATION);
    const endSec = Math.min(startSec + entryDuration, duration);

    // Split long text into multiple subtitle entries
    const chunks = splitIntoChunks(line.text, MAX_CHARS);
    const chunkDur = (endSec - startSec) / chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      entries.push({
        startSec: Math.round((startSec + i * chunkDur) * 100) / 100,
        endSec: Math.round((startSec + (i + 1) * chunkDur) * 100) / 100,
        text: chunks[i],
        speaker: line.speaker,
      });
    }

    cursor = endSec + 0.1; // small gap between entries
  }

  return entries;
}

interface DialogueLine {
  speaker?: string;
  text: string;
}

function parseDialogueLines(dialogue: string): DialogueLine[] {
  if (!dialogue.trim()) return [];

  const lines: DialogueLine[] = [];
  // Split on newlines, then detect "SPEAKER: text" pattern
  const raw = dialogue.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of raw) {
    const match = line.match(/^([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s]{0,30})\s*[:]\s*(.+)$/);
    if (match) {
      lines.push({ speaker: match[1].trim(), text: match[2].trim() });
    } else {
      lines.push({ text: line });
    }
  }

  return lines;
}

function parseActionLines(action: string): DialogueLine[] {
  if (!action.trim()) return [];

  const sentences = action
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences.map((s) => ({
    text: `[${s}]`,
  }));
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let current = "";

  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

// --- Export formats -----------------------------------------------------

/**
 * Export scenes' subtitles as SRT (SubRip) format.
 */
export function formatSRT(scenes: Scene[]): string {
  let index = 1;
  const blocks: string[] = [];
  let offset = 0;

  for (const scene of scenes) {
    const subs = scene.subtitles || [];
    for (const entry of subs) {
      const start = formatSRTTime(offset + entry.startSec);
      const end = formatSRTTime(offset + entry.endSec);
      const text = entry.speaker ? `<i>${entry.speaker}</i>\n${entry.text}` : entry.text;
      blocks.push(`${index}\n${start} --> ${end}\n${text}`);
      index++;
    }
    offset += scene.durationSec || 6;
  }

  return blocks.join("\n\n") + "\n";
}

/**
 * Export scenes' subtitles as WebVTT format.
 */
export function formatVTT(scenes: Scene[]): string {
  const lines: string[] = ["WEBVTT", ""];
  let offset = 0;

  for (const scene of scenes) {
    const subs = scene.subtitles || [];
    for (const entry of subs) {
      const start = formatVTTTime(offset + entry.startSec);
      const end = formatVTTTime(offset + entry.endSec);
      const text = entry.speaker ? `<v ${entry.speaker}>${entry.text}` : entry.text;
      lines.push(`${start} --> ${end}`);
      lines.push(text);
      lines.push("");
    }
    offset += scene.durationSec || 6;
  }

  return lines.join("\n");
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad3(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
