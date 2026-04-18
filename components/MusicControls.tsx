"use client";

import { useState } from "react";
import { MUSIC_STYLES } from "@/lib/music-styles";

interface MusicControlsProps {
  projectId: string;
  audioTrackUrl?: string;
  audioTrackStatus?: "idle" | "pending" | "ready" | "error";
  onUpdate: (patch: { audioTrackUrl?: string; audioTrackStatus?: "idle" | "pending" | "ready" | "error" }) => void;
}

/**
 * Project-level AI music generation controls.
 * Allows picking a style, adjusting duration, generating, and previewing.
 */
export default function MusicControls({
  projectId,
  audioTrackUrl,
  audioTrackStatus,
  onUpdate,
}: MusicControlsProps) {
  const [style, setStyle] = useState("cinematic");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    onUpdate({ audioTrackStatus: "pending" });

    try {
      const res = await fetch("/api/project-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          style,
          durationSec: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la generation");
        onUpdate({ audioTrackStatus: "error" });
        return;
      }
      onUpdate({
        audioTrackUrl: data.audioTrackUrl,
        audioTrackStatus: "ready",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau");
      onUpdate({ audioTrackStatus: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-flex-accent/20 bg-flex-accent/5 p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-flex-accent">
        Musique IA
      </div>

      {/* Style selector — grid of cards */}
      <div>
        <label className="!mb-2 !text-[10px]">Style musical</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MUSIC_STYLES.map((s) => {
            const active = style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                disabled={loading}
                className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold transition ${
                  active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
                    : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration slider */}
      <div>
        <label className="!mb-1 !text-[10px]">
          Duree : {duration}s
        </label>
        <input
          type="range"
          min={30}
          max={180}
          step={10}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          disabled={loading}
          className="w-full accent-flex-accent"
        />
        <div className="flex justify-between text-[9px] text-flex-muted">
          <span>30s</span>
          <span>180s</span>
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className={`w-full rounded-lg border px-4 py-2.5 text-xs font-bold transition ${
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
          "Generer la musique"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Audio preview */}
      {audioTrackUrl && audioTrackStatus === "ready" && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-flex-muted">
            Apercu musique
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            src={audioTrackUrl}
            className="w-full"
          />
          <div className="text-[9px] text-flex-muted">
            Style : {MUSIC_STYLES.find((s) => s.id === style)?.label || style}
            {" — "}{duration}s
          </div>
        </div>
      )}
    </div>
  );
}
