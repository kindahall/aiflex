"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PayoutRow {
  id: string;
  month: string;
  netAmount: number;
  payoutType: "primary" | "royalty" | "collab" | "bundle";
  status: "pending" | "paid" | "below_threshold" | "failed";
}

interface StatusPayload {
  payouts: PayoutRow[];
}

interface Props {
  /** Number of recent months to show. Default: 6. */
  months?: number;
  /** Compact mode for embedding in a row of dashboard cards. */
  compact?: boolean;
}

/**
 * Standalone earnings widget (V8 §A4).
 *
 * Sums all `CreatorPayout` rows of the logged-in user across the requested
 * window and shows the running total + last 6 months in a simple sparkline.
 * Deep-links to `/dashboard/payouts` for the full breakdown and Stripe
 * Connect onboarding state.
 *
 * Reuses the existing `/api/stripe/connect/status` endpoint — no new API
 * surface needed.
 */
export default function EarningsDashboard({ months = 6, compact = false }: Props) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/connect/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((j: StatusPayload) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e === "string" ? e : "Erreur");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card compact={compact}>
        <Header label="Revenus" />
        <p className="text-sm text-flex-muted">⚠️ {error}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card compact={compact}>
        <Header label="Revenus" />
        <div className="h-12 w-32 animate-pulse rounded bg-flex-card" />
      </Card>
    );
  }

  const recentMonths = aggregateByMonth(data.payouts).slice(0, months);
  const total = recentMonths.reduce((acc, m) => acc + m.netAmount, 0);
  const max = Math.max(1, ...recentMonths.map((m) => m.netAmount));

  return (
    <Card compact={compact}>
      <Header label={`Revenus (${months} derniers mois)`} />
      <div className="mt-1 font-display text-3xl font-bold text-flex-accent">
        ${(total / 100).toFixed(2)}
      </div>

      {recentMonths.length > 1 && (
        <div className="mt-4 flex h-10 items-end gap-1">
          {[...recentMonths].reverse().map((m) => (
            <div
              key={m.month}
              className="flex-1 rounded-t bg-flex-accent/70 transition hover:bg-flex-accent"
              style={{ height: `${(m.netAmount / max) * 100}%` }}
              title={`${formatMonth(m.month)} : $${(m.netAmount / 100).toFixed(2)}`}
            />
          ))}
        </div>
      )}

      <Link
        href="/dashboard/payouts"
        className="mt-4 inline-block text-xs text-flex-accent hover:underline"
      >
        Voir le détail →
      </Link>
    </Card>
  );
}

function Card({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact: boolean;
}) {
  return (
    <section
      className={`rounded-3xl border border-flex-border bg-flex-panel ${
        compact ? "p-4" : "p-6"
      } shadow-cinema`}
    >
      {children}
    </section>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-flex-muted">
      {label}
    </div>
  );
}

function aggregateByMonth(rows: PayoutRow[]) {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.netAmount);
  }
  return [...byMonth.entries()]
    .map(([month, netAmount]) => ({ month, netAmount }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}
