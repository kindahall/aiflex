"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-16" />}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 6) {
      setError("6 caractères minimum.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          ⚠ Lien invalide : token manquant. Redemande un lien depuis{" "}
          <Link
            href="/forgot-password"
            className="font-semibold text-flex-accent underline"
          >
            la page de réinitialisation
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Réinitialisation
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">
        Nouveau mot de passe
      </h1>
      <p className="mb-8 text-sm text-flex-muted">
        Choisis un nouveau mot de passe pour ton compte AIflex.
      </p>

      {done ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-200">
          ✓ Mot de passe mis à jour. Redirection vers la connexion…
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema"
        >
          <div>
            <label htmlFor="password">Nouveau mot de passe</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 caractères minimum"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="confirm">Confirmation</label>
            <input
              id="confirm"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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
            {busy ? "Mise à jour…" : "Réinitialiser"}
          </button>
        </form>
      )}
    </div>
  );
}
