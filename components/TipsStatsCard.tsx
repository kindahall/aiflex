"use client";

import { useEffect, useState } from "react";

interface TipStats {
  totalReceived: number;
  tipCount: number;
}

/**
 * Cumulative tips the current creator has received. Hidden when no tips
 * have ever been received so new accounts aren't reminded they're empty.
 */
export default function TipsStatsCard() {
  const [stats, setStats] = useState<TipStats | null>(null);

  useEffect(() => {
    fetch("/api/tips?stats=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStats({ totalReceived: d.totalReceived || 0, tipCount: d.tipCount || 0 }))
      .catch(() => setStats({ totalReceived: 0, tipCount: 0 }));
  }, []);

  if (!stats) return null;
  if (stats.tipCount === 0) return null;

  const euros = (stats.totalReceived / 100).toFixed(2);

  return (
    <div className="rounded-2xl border border-flex-accent/40 bg-flex-accent/5 p-5 shadow-cinema">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-accent">
        Revenus créateur
      </div>
      <h3 className="text-base font-bold">Tips reçus</h3>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-black tracking-tight">{euros}€</div>
        <div className="text-xs text-flex-muted">
          sur {stats.tipCount} tip{stats.tipCount > 1 ? "s" : ""}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-flex-muted">
        Les tips sont versés directement via Stripe. Consulte le portail
        facturation pour les paiements.
      </p>
    </div>
  );
}
