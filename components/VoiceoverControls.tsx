"use client";

import { useState } from "react";
import type { Scene } from "@/lib/types";
import { TTS_VOICES } from "@/lib/platform-settings";

/**
 * Per-scene voiceover (TTS) controls for the studio scene editor.
 * Allows selecting a voice, editing the text, generating, and previewing audio.
 */
export default function VoiceoverControls({
  scene,
  projectId,
  onChange,
}: {
  scene: Scene;
  projectId: string;
  onChange: (patch: Partial<Scene>) => void;
}) {
  const [voice, setVoice] = useState(scene.voiceoverVoice || "nova");
  const [text, setText] = useState(
    scene.voiceoverText || scene.dialogue || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scene-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId: scene.id,
          text: text.trim() || undefined,
          voice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la generation");
        onChange({ voiceoverStatus: "error" });
        return;
      }
      onChange({
        voiceoverUrl: data.voiceoverUrl,
        voiceoverStatus: "ready",
        voiceoverText: text,
        voiceoverVoice: voice,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau");
      onChange({ voiceoverStatus: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-flex-accent/20 bg-flex-accent/5 p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-flex-accent">
        Voix off (TTS)
      </div>

      {/* Voice selector */}
      <div>
        <label className="!mb-1 !text-[10px]">Voix</label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          disabled={loading}
        >
          {TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} — {v.note}
            </option>
          ))}
        </select>
      </div>

      {/* Text input */}
      <div>
        <label className="!mb-1 !text-[10px]">Texte a synthetiser</label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Le dialogue de la scene sera utilise par defaut..."
          disabled={loading}
          className="w-full resize-y"
        />
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !text.trim()}
        className={`w-full rounded-lg border px-4 py-2 text-xs font-bold transition ${
          loading
            ? "cursor-wait border-flex-border bg-flex-card text-flex-muted"
            : "border-flex-accent bg-flex-accent/10 text-flex-accent hover:bg-flex-accent/20"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generation en cours...
          </span>
        ) : (
          "Generer la voix"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Audio preview */}
      {scene.voiceoverUrl && scene.voiceoverStatus === "ready" && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-flex-muted">
            Apercu audio
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            src={scene.voiceoverUrl}
            className="w-full"
          />
          <div className="text-[9px] text-flex-muted">
            Voix : {TTS_VOICES.find((v) => v.id === scene.voiceoverVoice)?.label || scene.voiceoverVoice}
          </div>
        </div>
      )}
    </div>
  );
}
