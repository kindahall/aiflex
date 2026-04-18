"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // The API always returns 200 to prevent enumeration. Show the
      // same confirmation no matter what so we don't leak signal here.
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Mot de passe oublié
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">
        Réinitialiser
      </h1>
      <p className="mb-8 text-sm text-flex-muted">
        Saisis ton adresse email. Si un compte existe, on t&apos;envoie un
        lien de réinitialisation valide 1 heure.
      </p>

      {submitted ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-200">
          ✓ Si <strong>{email}</strong> est associé à un compte, un lien
          de réinitialisation vient de partir. Pense à vérifier ton
          dossier spam.
          <div className="mt-4">
            <Link
              href="/login"
              className="text-xs font-semibold text-flex-accent underline-offset-4 hover:underline"
            >
              ← Retour à la connexion
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema"
        >
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@example.com"
              autoComplete="email"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-flex-accent py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Envoyer le lien"}
          </button>

          <div className="text-center text-xs text-flex-muted">
            <Link
              href="/login"
              className="font-semibold text-flex-accent hover:underline"
            >
              ← Retour à la connexion
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
