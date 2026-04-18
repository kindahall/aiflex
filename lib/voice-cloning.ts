import "server-only";
import { prisma } from "./prisma";

/**
 * ElevenLabs Voice Cloning — creator clones their own voice, then it can
 * be used as the narration voice in TTS for their films (V8 §28.1).
 *
 * Flow:
 *   1. Creator uploads 30-60s of clean speech via /api/voices/clone
 *   2. We call POST /v1/voices/add with the audio file → voice_id
 *   3. Persist voice_id on `User.elevenLabsVoiceId`
 *   4. Subsequent TTS calls (lib/tts) prefer this voice over the platform default
 *
 * Cost:
 *   - Clone (one-shot): free up to first 10, then $1/voice on Creator plan
 *   - Usage: ~$0.30 per 1k chars synthesized
 *
 * Consent (V8 §B1): cloning a voice = biometric data. Caller MUST present
 * an explicit opt-in checkbox; we record it as a ConsentRecord here.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

export interface CloneResult {
  skipped: boolean;
  reason?: string;
  voiceId?: string;
}

/**
 * Upload a sample to ElevenLabs and persist the resulting voice_id on the
 * user. `audioBuffer` should be 30-60s of clean speech (mono 22kHz+ WAV/MP3).
 */
export async function cloneVoiceForUser(
  userId: string,
  audioBuffer: Buffer,
  fileName: string,
  voiceLabel: string
): Promise<CloneResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "ELEVENLABS_API_KEY not configured" };
  }
  if (audioBuffer.length === 0) {
    return { skipped: true, reason: "Empty audio buffer" };
  }
  if (audioBuffer.length > 25 * 1024 * 1024) {
    return { skipped: true, reason: "Audio sample > 25 MB" };
  }

  // Idempotency: if user already has a voice id, refuse to overwrite without
  // explicit caller intent. The /api/voices/clone route resets it first if
  // needed.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { elevenLabsVoiceId: true },
  });
  if (existing?.elevenLabsVoiceId) {
    return { skipped: true, reason: "User already has a cloned voice" };
  }

  const form = new FormData();
  form.append("name", voiceLabel.slice(0, 50));
  form.append("description", `AIflex cloned voice for user ${userId}`);
  form.append(
    "files",
    new File([audioBuffer], fileName, { type: "audio/mpeg" })
  );

  const res = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `ElevenLabs voice clone failed (${res.status}): ${text.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as { voice_id: string };

  await prisma.user.update({
    where: { id: userId },
    data: { elevenLabsVoiceId: data.voice_id },
  });

  // Record consent (biometric data, GDPR + CCPA)
  await prisma.consentRecord
    .create({
      data: {
        userId,
        type: "privacy", // we don't have a "voice_clone" type yet
        version: "voice-clone-1",
        accepted: true,
      },
    })
    .catch(() => {});

  return { skipped: false, voiceId: data.voice_id };
}

/**
 * Delete the user's cloned voice both from ElevenLabs and our DB.
 * Called from /dashboard/privacy when the user revokes voice consent.
 */
export async function deleteClonedVoice(userId: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { elevenLabsVoiceId: true },
  });
  if (!user?.elevenLabsVoiceId) return;

  if (apiKey) {
    await fetch(`${API_BASE}/voices/${user.elevenLabsVoiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    }).catch(() => {});
  }

  await prisma.user.update({
    where: { id: userId },
    data: { elevenLabsVoiceId: null },
  });
}

/**
 * Synthesize speech with the user's cloned voice. Returns the MP3 buffer.
 * Falls back to caller error if no voice id exists for this user.
 */
export async function synthesizeWithClonedVoice(
  userId: string,
  text: string
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { elevenLabsVoiceId: true },
  });
  if (!user?.elevenLabsVoiceId) {
    throw new Error("User has no cloned voice");
  }

  const res = await fetch(
    `${API_BASE}/text-to-speech/${user.elevenLabsVoiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
