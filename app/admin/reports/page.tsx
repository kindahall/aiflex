"use client";

import { useCallback, useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import type { Report } from "@/lib/types";

type FilterStatus = "all" | "pending" | "reviewed" | "dismissed";

const STATUS_LABELS: Record<Report["status"], { label: string; cls: string }> = {
  pending: {
    label: "En attente",
    cls: "bg-flex-accent/20 text-flex-accent",
  },
  reviewed: {
    label: "Traité",
    cls: "bg-emerald-500/20 text-emerald-300",
  },
  dismissed: {
    label: "Rejeté",
    cls: "bg-flex-border text-flex-muted",
  },
};

const REASON_LABELS: Record<string, string> = {
  hate: "Haine / discrimination",
  violence: "Violence graphique",
  sexual: "Contenu sexuel",
  minors: "Implique des mineurs",
  copyright: "Droit d'auteur",
  spam: "Spam / arnaque",
  other: "Autre",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        filter === "all"
          ? "/api/admin/reports"
          : `/api/admin/reports?status=${filter}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReports(data.reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: string, status: "reviewed" | "dismissed") {
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (loading) return <LoadingPulse label="Chargement des signalements" />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Signalements</h2>
          <p className="text-sm text-flex-muted">
            {reports.length} signalement{reports.length > 1 ? "s" : ""}
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterStatus)}
          className="!w-auto"
        >
          <option value="pending">En attente</option>
          <option value="reviewed">Traités</option>
          <option value="dismissed">Rejetés</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-10 text-center text-sm text-flex-muted">
          {filter === "pending"
            ? "Aucun signalement en attente."
            : "Aucun signalement."}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const st = STATUS_LABELS[r.status];
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-start gap-4 rounded-2xl border border-flex-border bg-flex-card p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    <span className="rounded-full bg-flex-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
                      {r.targetType}
                    </span>
                    <span className="text-[10px] text-flex-muted">
                      {REASON_LABELS[r.reason] || r.reason}
                    </span>
                  </div>
                  <div className="mb-1 text-sm">
                    <span className="text-flex-muted">Reporter :</span>{" "}
                    <span className="font-semibold">{r.reporterEmail}</span>
                  </div>
                  <div className="mb-1 text-sm">
                    <span className="text-flex-muted">Cible :</span>{" "}
                    <code className="font-mono text-xs text-flex-text">
                      {r.targetId}
                    </code>
                  </div>
                  {r.detail && (
                    <div className="mt-2 rounded-lg bg-flex-panel p-3 text-xs text-flex-muted">
                      {r.detail}
                    </div>
                  )}
                  <div className="mt-2 text-[10px] text-flex-muted">
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                    {r.reviewedAt && (
                      <span>
                        {" · Traité le "}
                        {new Date(r.reviewedAt).toLocaleString("fr-FR")}
                      </span>
                    )}
                  </div>
                </div>
                {r.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => updateStatus(r.id, "reviewed")}
                      className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                    >
                      Traiter
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(r.id, "dismissed")}
                      className="rounded-lg bg-flex-panel px-3 py-1.5 text-[11px] font-semibold text-flex-muted transition hover:bg-flex-border"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
