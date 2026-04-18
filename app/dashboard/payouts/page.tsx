"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

interface ConnectStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requiresAction: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  country: string | null;
  email: string | null;
}

interface PayoutRow {
  id: string;
  month: string;
  projectId: string | null;
  totalViews: number;
  qualifiedViews: number;
  grossAmount: number;
  netAmount: number;
  payoutType: "primary" | "royalty" | "collab" | "bundle";
  status: "pending" | "paid" | "below_threshold" | "failed";
  paidAt: string | null;
  createdAt: string;
}

interface StatusPayload {
  onboarded: boolean;
  connect: ConnectStatus | null;
  credits: number;
  payouts: PayoutRow[];
}

/**
 * Creator payouts dashboard (V7 §8, V8 §A11).
 * - Shows Stripe Connect onboarding state
 * - Lets the creator resume onboarding or open the Stripe Express dashboard
 * - Lists CreatorPayout rows grouped by month
 * - Shows any store credit (avoirs) from rejected uploads
 */
export default function PayoutsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stripe/connect/status", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StatusPayload;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function startOnboarding() {
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "FR" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setActionPending(false);
    }
  }

  async function openStripeDashboard() {
    setActionPending(true);
    try {
      const res = await fetch("/api/stripe/connect/login", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec");
      window.open(json.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionPending(false);
    }
  }

  if (authLoading) {
    return <Centered>Chargement…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        Connecte-toi.{" "}
        <Link href="/login?redirect=/dashboard/payouts" className="text-flex-accent underline">
          Se connecter
        </Link>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8 animate-fadeUp">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
        >
          ← Retour au dashboard
        </Link>
        <h1 className="font-display text-4xl font-bold">Mes revenus créateur</h1>
        <p className="mt-2 max-w-2xl text-flex-muted">
          Suivi de tes vues qualifiées, de tes royalties de suites, et du
          versement mensuel via Stripe Connect.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="h-48 animate-pulse rounded-3xl bg-flex-card" aria-hidden />
      )}

      {data && <OnboardingCard data={data} onStart={startOnboarding} onOpenDashboard={openStripeDashboard} pending={actionPending} />}

      {data && data.credits > 0 && (
        <section className="mb-6 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
          <h2 className="font-display text-lg font-semibold">
            💰 Avoir disponible
          </h2>
          <p className="mt-2 text-2xl font-bold">
            ${(data.credits / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-flex-muted">
            Crédité suite à un refus d&apos;upload public ou un remboursement.
            Utilisable sur toute nouvelle commande.
          </p>
        </section>
      )}

      {data && <PayoutsHistory payouts={data.payouts} />}
    </div>
  );
}

function OnboardingCard({
  data,
  onStart,
  onOpenDashboard,
  pending,
}: {
  data: StatusPayload;
  onStart: () => void;
  onOpenDashboard: () => void;
  pending: boolean;
}) {
  if (!data.onboarded || !data.connect) {
    return (
      <section className="mb-8 rounded-3xl border border-flex-border bg-flex-panel p-8 shadow-cinema">
        <h2 className="font-display text-xl font-semibold">
          🎬 Active les versements
        </h2>
        <p className="mt-2 max-w-xl text-sm text-flex-muted">
          Pour recevoir tes revenus créateur, tu dois compléter une inscription
          Stripe Connect (5 minutes). Stripe gère la conformité, la collecte de
          ton RIB et ta fiscalité.
        </p>
        <button
          onClick={onStart}
          disabled={pending}
          className="mt-6 rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-3 font-medium text-white shadow-glowSm hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Préparation…" : "Démarrer l'inscription Stripe"}
        </button>
        <p className="mt-4 text-xs text-flex-muted">
          Seuil minimum de versement : $10. Frais AIflex : 2 %. Frais Stripe :
          0.25 % + 0.10 € par virement, pris sur notre marge.
        </p>
      </section>
    );
  }

  const c = data.connect;
  const ready = c.chargesEnabled && c.payoutsEnabled && c.detailsSubmitted;

  return (
    <section className="mb-8 rounded-3xl border border-flex-border bg-flex-panel p-8 shadow-cinema">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {ready ? "✅ Versements actifs" : "🟡 Inscription à compléter"}
          </h2>
          <p className="mt-1 text-sm text-flex-muted">
            {ready
              ? "Tu es prêt à recevoir des paiements mensuels. Le prochain versement a lieu le 1er du mois."
              : "Stripe a besoin d'informations supplémentaires pour activer tes versements."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!ready && (
            <button
              onClick={onStart}
              disabled={pending}
              className="rounded-full bg-flex-accent px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "…" : "Reprendre l'inscription"}
            </button>
          )}
          <button
            onClick={onOpenDashboard}
            disabled={pending}
            className="rounded-full border border-flex-border px-5 py-2.5 text-sm hover:bg-flex-card disabled:opacity-50"
          >
            Dashboard Stripe ↗
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCell label="Paiements acceptés" on={c.chargesEnabled} />
        <StatusCell label="Versements actifs" on={c.payoutsEnabled} />
        <StatusCell label="Infos complètes" on={c.detailsSubmitted} />
        <StatusCell label="Action requise" on={!c.requiresAction} invert />
      </div>

      {c.requiresAction && c.currentlyDue.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-400">
          <div className="font-medium">Documents manquants :</div>
          <ul className="mt-1 list-inside list-disc">
            {c.currentlyDue.slice(0, 8).map((d) => (
              <li key={d}>{humanizeRequirement(d)}</li>
            ))}
          </ul>
        </div>
      )}

      {c.disabledReason && (
        <div className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
          Compte en pause : {c.disabledReason}
        </div>
      )}
    </section>
  );
}

function StatusCell({
  label,
  on,
  invert = false,
}: {
  label: string;
  on: boolean;
  invert?: boolean;
}) {
  const green = invert ? on : on;
  return (
    <div className="rounded-xl bg-flex-card p-3">
      <div className="text-xs text-flex-muted">{label}</div>
      <div
        className={`mt-0.5 text-sm font-medium ${
          green ? "text-emerald-400" : "text-amber-400"
        }`}
      >
        {green ? "✓ OK" : "• En attente"}
      </div>
    </div>
  );
}

function PayoutsHistory({ payouts }: { payouts: PayoutRow[] }) {
  if (payouts.length === 0) {
    return (
      <section className="rounded-3xl border border-flex-border bg-flex-panel p-8 text-center shadow-cinema">
        <div className="mb-2 text-4xl">📊</div>
        <h2 className="font-display text-xl font-semibold">Aucun revenu pour l&apos;instant</h2>
        <p className="mt-2 text-sm text-flex-muted">
          Dès que tes films commenceront à être vus par des abonnés, tu verras
          les revenus s&apos;accumuler ici. Le calcul est fait le 1er de chaque mois.
        </p>
      </section>
    );
  }

  // Group by month
  const byMonth = new Map<string, PayoutRow[]>();
  for (const p of payouts) {
    const arr = byMonth.get(p.month) ?? [];
    arr.push(p);
    byMonth.set(p.month, arr);
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Historique</h2>
      {[...byMonth.entries()].map(([month, rows]) => {
        const total = rows.reduce((acc, r) => acc + r.netAmount, 0);
        return (
          <div key={month} className="overflow-hidden rounded-2xl border border-flex-border bg-flex-panel">
            <header className="flex items-baseline justify-between border-b border-flex-border bg-flex-card/50 px-5 py-3">
              <div className="font-medium">{formatMonth(month)}</div>
              <div className="text-sm font-semibold text-flex-accent">
                ${(total / 100).toFixed(2)}
              </div>
            </header>
            <ul className="divide-y divide-flex-border text-sm">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-baseline gap-2">
                    <PayoutTypeBadge type={r.payoutType} />
                    <span className="text-flex-muted">
                      {r.qualifiedViews}/{r.totalViews} vues qualifiées
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-flex-muted">
                      ${(r.netAmount / 100).toFixed(2)}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function PayoutTypeBadge({ type }: { type: PayoutRow["payoutType"] }) {
  const map: Record<PayoutRow["payoutType"], { label: string; cls: string }> = {
    primary: { label: "Principal", cls: "bg-flex-accent/10 text-flex-accent" },
    royalty: { label: "Royalty suite", cls: "bg-purple-500/10 text-purple-400" },
    collab: { label: "Collab", cls: "bg-blue-500/10 text-blue-400" },
    bundle: { label: "Bundle", cls: "bg-emerald-500/10 text-emerald-400" },
  };
  const cfg = map[type];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: PayoutRow["status"] }) {
  const map: Record<PayoutRow["status"], { label: string; cls: string }> = {
    pending: { label: "En attente", cls: "bg-amber-500/10 text-amber-400" },
    paid: { label: "Versé", cls: "bg-emerald-500/10 text-emerald-400" },
    below_threshold: {
      label: "Sous seuil ($10)",
      cls: "bg-flex-card text-flex-muted",
    },
    failed: { label: "Échoué", cls: "bg-red-500/10 text-red-400" },
  };
  const cfg = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
      {children}
    </div>
  );
}

function formatMonth(month: string): string {
  // "2026-04" → "Avril 2026"
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(d).replace(/^./, (c) => c.toUpperCase());
}

function humanizeRequirement(key: string): string {
  // Stripe requirement keys like "individual.verification.document" → friendly label
  const parts = key.split(".");
  const last = parts[parts.length - 1];
  const map: Record<string, string> = {
    document: "Pièce d'identité",
    address: "Adresse postale",
    tax_id: "Identifiant fiscal",
    bank_account: "RIB pour les versements",
    phone: "Numéro de téléphone",
    verification: "Vérification d'identité",
    dob: "Date de naissance",
    ssn_last_4: "Derniers chiffres du SSN (US)",
  };
  return map[last] || key;
}
