"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";

const REASONS = [
  { value: "hate", label: "Haine, discrimination" },
  { value: "violence", label: "Violence graphique" },
  { value: "sexual", label: "Contenu sexuel" },
  { value: "minors", label: "Implique des mineurs" },
  { value: "copyright", label: "Atteinte au droit d'auteur" },
  { value: "spam", label: "Spam / arnaque" },
  { value: "other", label: "Autre" },
] as const;

/**
 * In-app report button. Opens a modal asking for a reason, sends to
 * /api/report. No DB table yet — reports are logged to console (and
 * would go to a `reports` table with 1.1 Postgres). The admin dashboard
 * doesn't expose them yet either — but the mechanism exists for when we
 * build moderation tooling.
 */
export default function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "project" | "comment";
  targetId: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  if (done) {
    return (
      <span className="text-[10px] text-flex-muted">✓ Signalé</span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] font-semibold text-flex-muted transition hover:text-red-400"
      >
        ⚑ Signaler
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
            <div className="mb-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-red-400">
                Signalement
              </div>
              <h3 className="text-xl font-black">
                Signaler un contenu
              </h3>
              <p className="mt-1 text-xs text-flex-muted">
                Ce signalement sera examiné par notre équipe de
                modération.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="report-reason">Raison</label>
                <select
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                >
                  <option value="">Choisir une raison…</option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="report-detail">
                  Détails (optionnel)
                </label>
                <textarea
                  id="report-detail"
                  rows={3}
                  maxLength={500}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Précise si nécessaire…"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  ⚠ {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || !reason}
                  className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  {busy ? "Envoi…" : "Envoyer le signalement"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
