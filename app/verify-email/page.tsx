"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-16" />}>
      <VerifyInner />
    </Suspense>
  );
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; email: string; alreadyVerified: boolean }
  | { kind: "err"; message: string };

function VerifyInner() {
  const params = useSearchParams();
  const token = params?.get("token") || "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({
        kind: "err",
        message: "Lien invalide : token manquant.",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "err", message: data.error || "Erreur" });
          return;
        }
        setState({
          kind: "ok",
          email: data.email,
          alreadyVerified: Boolean(data.alreadyVerified),
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "err",
            message: err instanceof Error ? err.message : "Erreur",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Vérification d&apos;adresse
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">Email</h1>

      {state.kind === "loading" && (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-6 text-sm text-flex-muted">
          Vérification du lien en cours…
        </div>
      )}

      {state.kind === "ok" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-200">
          ✓ Adresse <strong>{state.email}</strong>{" "}
          {state.alreadyVerified ? "déjà vérifiée." : "vérifiée avec succès."}
          <div className="mt-4 flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg bg-flex-text px-4 py-2 text-xs font-bold text-flex-bg transition hover:opacity-90"
            >
              Aller au dashboard
            </Link>
            <Link
              href="/studio"
              className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
            >
              + Nouveau film
            </Link>
          </div>
        </div>
      )}

      {state.kind === "err" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          ⚠ {state.message}
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-flex-accent underline-offset-4 hover:underline"
            >
              Aller au dashboard pour redemander un lien →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
