"use client";

import { useState } from "react";

interface Props {
  profileId: string;
  /** Called once the PIN check succeeds. */
  onUnlocked: () => void;
  onCancel?: () => void;
}

/**
 * Modal-style PIN challenge (V8 §22.2).
 *
 * Usage: render conditionally when navigating from a Kids profile to an
 * adult one and the cookie indicates a challenge is required. The
 * server endpoint `/api/profiles/[id]/verify-pin` is rate-limited
 * (5 attempts/h) so brute-forcing is bounded.
 */
export default function ParentalPinGate({ profileId, onUnlocked, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.error || "Trop de tentatives.");
      } else if (!data.valid) {
        setError("PIN incorrect.");
        setPin("");
      } else {
        onUnlocked();
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema"
      >
        <div className="mb-2 text-center text-3xl">🔐</div>
        <h2 className="text-center font-display text-xl font-semibold">
          Profil protégé
        </h2>
        <p className="mt-2 text-center text-sm text-flex-muted">
          Saisis le PIN parental pour quitter le profil Kids.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
          placeholder="••••"
          aria-label="PIN parental"
          className="mt-5 w-full rounded-xl border border-flex-border bg-flex-surface px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-flex-accent focus:outline-none"
        />

        {error && (
          <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-full border border-flex-border px-4 py-2 text-sm hover:bg-flex-card"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={pending || pin.length < 4}
            className="flex-1 rounded-full bg-flex-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Vérification…" : "Déverrouiller"}
          </button>
        </div>
      </form>
    </div>
  );
}
