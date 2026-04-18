"use client";

import { useState } from "react";

interface Props {
  hasExistingVoice: boolean;
}

export default function VoiceCloneForm({ hasExistingVoice }: Props) {
  const [hasVoice, setHasVoice] = useState(hasExistingVoice);
  const [file, setFile] = useState<File | null>(null);
  const [voiceLabel, setVoiceLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function clone() {
    if (!file) return setError("Choisis un fichier audio.");
    if (!consent) return setError("Tu dois accepter le consentement biométrique.");

    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("voiceLabel", voiceLabel || "Ma voix");
      form.append("consent", "1");
      const res = await fetch("/api/voices/clone", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (data.skipped) throw new Error(data.reason || "Skippé");
      setHasVoice(true);
      setSuccess(true);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!confirm("Supprimer définitivement ta voix clonée ?")) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/voices/clone", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Erreur");
      }
      setHasVoice(false);
      setSuccess(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  if (hasVoice) {
    return (
      <div className="space-y-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-emerald-400">
          ✓ Voix clonée active
        </h2>
        <p className="text-sm text-flex-muted">
          Ta voix est synchronisée chez ElevenLabs. Elle sera utilisée
          automatiquement comme narration dans tes prochains films AIflex.
        </p>
        {error && (
          <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
        <button
          onClick={revoke}
          disabled={pending}
          className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
        >
          {pending ? "…" : "Supprimer ma voix"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl border border-flex-border bg-flex-panel p-6 sm:p-8 shadow-cinema">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Échantillon audio (30-60s, MP3 ou WAV, qualité claire)
        </label>
        <input
          type="file"
          accept="audio/mpeg,audio/wav,audio/x-wav"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-flex-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:brightness-110"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Nom de la voix
        </label>
        <input
          value={voiceLabel}
          onChange={(e) => setVoiceLabel(e.target.value)}
          placeholder="Ma voix narrative"
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
          maxLength={50}
        />
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-flex-card p-4 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-flex-border text-flex-accent"
        />
        <span className="text-flex-muted">
          J&apos;accepte explicitement que ma voix soit traitée comme une donnée
          biométrique par AIflex et son sous-traitant ElevenLabs (RGPD art. 9).
          Je peux la révoquer à tout moment depuis cette page ou depuis{" "}
          <a href="/dashboard/privacy" className="text-flex-accent underline">
            /dashboard/privacy
          </a>
          .
        </span>
      </label>

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          ✓ Voix clonée enregistrée
        </div>
      )}

      <div className="flex justify-end border-t border-flex-border pt-4">
        <button
          onClick={clone}
          disabled={pending || !file || !consent}
          className="rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-2.5 font-medium text-white shadow-glowSm hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Clonage…" : "Cloner ma voix"}
        </button>
      </div>
    </div>
  );
}
