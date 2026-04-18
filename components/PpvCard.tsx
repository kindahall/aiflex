"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  projectId: string;
  /** Price in cents (project.ppvPrice). Required when not already owned. */
  priceCents: number;
  /** Title of the film, shown in the CTA. */
  filmTitle?: string;
  /** When true, the user already owns PPV access — show the watch CTA instead. */
  alreadyOwned?: boolean;
}

/**
 * Pay-per-view checkout card (V8 §21.2).
 *
 * Embedded above the locked WatchPlayer when a film has `ppvPrice` set
 * and the user has no `PpvPurchase` row. Hits /api/ppv/checkout which
 * resolves either:
 *   - alreadyOwned: true  → we redirect to the watch URL directly
 *   - url               → we redirect to Stripe Checkout
 */
export default function PpvCard({
  projectId,
  priceCents,
  filmTitle,
  alreadyOwned,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ppv/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (data.alreadyOwned) {
        window.location.href = data.watchUrl;
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
    }
  }

  if (alreadyOwned) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
        <div className="text-sm font-medium text-emerald-400">
          ✓ Tu as déjà acheté ce film — accès à vie.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-flex-border bg-gradient-to-br from-flex-accent/10 via-flex-panel to-flex-accent2/10 p-6 shadow-cinema sm:p-8">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
        Pay-per-view
      </div>
      <h3 className="font-display text-xl font-bold">
        Débloque {filmTitle ?? "ce film"}
      </h3>
      <p className="mt-2 text-sm text-flex-muted">
        Achat unique — accès à vie. Sans abonnement, sans engagement.
      </p>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-4">
        <div className="font-display text-3xl font-bold text-flex-accent">
          ${(priceCents / 100).toFixed(2)}
        </div>
        <button
          onClick={checkout}
          disabled={pending}
          className="rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-3 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Redirection…" : "Acheter et regarder"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <p className="mt-4 text-xs text-flex-muted">
        Tu préfères tout regarder en illimité ?{" "}
        <Link href="/pricing" className="text-flex-accent underline">
          Voir les abonnements
        </Link>
        .
      </p>
    </div>
  );
}
