"use client";

import { useState } from "react";

export default function LipSyncPanel({
  projectId,
  sceneId,
  videoUrl,
  audioUrl,
}: {
  projectId?: string;
  sceneId?: string;
  videoUrl?: string;
  audioUrl?: string;
}) {
  const [inputVideoUrl, setInputVideoUrl] = useState(videoUrl || "");
  const [inputAudioUrl, setInputAudioUrl] = useState(audioUrl || "");
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSync() {
    if (!inputVideoUrl || !inputAudioUrl) return;
    setLoading(true);
    setError("");
    setResultUrl("");

    try {
      const res = await fetch("/api/lip-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: inputVideoUrl,
          audioUrl: inputAudioUrl,
          projectId,
          sceneId,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResultUrl(data.outputUrl);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <h3 className="font-bold text-flex-text mb-1">Lip Sync IA</h3>
      <p className="text-xs text-flex-muted mb-4">
        Synchronise les lèvres d&apos;une vidéo avec un audio
      </p>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-flex-text mb-1">
            Vidéo source (URL)
          </label>
          <input
            type="url"
            value={inputVideoUrl}
            onChange={(e) => setInputVideoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-flex-text mb-1">
            Audio (URL)
          </label>
          <input
            type="url"
            value={inputAudioUrl}
            onChange={(e) => setInputAudioUrl(e.target.value)}
            placeholder="https://... (voix off, dialogue)"
            className="w-full rounded-xl bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={loading || !inputVideoUrl || !inputAudioUrl}
        className="w-full rounded-full bg-flex-accent py-2.5 text-sm font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50 mb-4"
      >
        {loading ? "Synchronisation en cours..." : "Lancer le Lip Sync"}
      </button>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      {resultUrl && (
        <div>
          <p className="text-xs font-medium text-flex-text mb-2">Résultat :</p>
          <video
            src={resultUrl}
            controls
            className="w-full rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
