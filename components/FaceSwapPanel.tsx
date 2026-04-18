"use client";

import { useState } from "react";

export default function FaceSwapPanel() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [faceUrl, setFaceUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSwap() {
    if (!sourceUrl || !faceUrl) return;
    setLoading(true);
    setError("");
    setResultUrl("");

    try {
      const res = await fetch("/api/face-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, faceUrl }),
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
      <h3 className="font-bold text-flex-text mb-1">AI Avatar / Face Swap</h3>
      <p className="text-xs text-flex-muted mb-4">
        Remplace le visage d&apos;une image par un autre via l&apos;IA
      </p>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-flex-text mb-1">
            Image/vidéo source (URL)
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-flex-text mb-1">
            Visage à appliquer (URL)
          </label>
          <input
            type="url"
            value={faceUrl}
            onChange={(e) => setFaceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSwap}
        disabled={loading || !sourceUrl || !faceUrl}
        className="w-full rounded-full bg-flex-accent py-2.5 text-sm font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50 mb-4"
      >
        {loading ? "Traitement IA en cours..." : "Lancer le Face Swap"}
      </button>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      {resultUrl && (
        <div>
          <p className="text-xs font-medium text-flex-text mb-2">Résultat :</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Face swap result"
            className="w-full rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
