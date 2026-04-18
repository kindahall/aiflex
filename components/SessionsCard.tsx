"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface SessionItem {
  id: string;
  createdAt: number;
  expiresAt: number;
  current: boolean;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Lists the current user's active sessions and lets them revoke any of
 * them — including the current one (which triggers a redirect to login).
 */
export default function SessionsCard() {
  const { toast } = useToast();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/sessions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setSessions(data.sessions || []);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string, isCurrent: boolean) {
    if (
      isCurrent &&
      !confirm(
        "Cette session est la session en cours. Tu seras déconnecté. Continuer ?"
      )
    )
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/sessions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (isCurrent) {
        window.dispatchEvent(new Event("aiflex:auth-changed"));
        router.push("/login");
        return;
      }
      toast("success", "Session déconnectée");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAllOthers() {
    if (!confirm("Déconnecter toutes les autres sessions ?")) return;
    setBusyAll(true);
    try {
      const res = await fetch("/api/me/sessions", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast("success", `${data.removed} session(s) déconnectée(s)`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-accent">
            Sécurité
          </div>
          <h3 className="text-lg font-bold">Sessions actives</h3>
          <p className="mt-1 text-xs text-flex-muted">
            Les appareils actuellement connectés à ton compte. Déconnecte tout
            ce que tu ne reconnais pas.
          </p>
        </div>
        {sessions.length > 1 && (
          <button
            type="button"
            onClick={revokeAllOthers}
            disabled={busyAll}
            className="rounded-lg border border-flex-border bg-flex-panel px-3 py-2 text-xs font-semibold text-flex-text transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
          >
            {busyAll ? "…" : "Déconnecter les autres"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-flex-muted">Chargement…</div>
      ) : sessions.length === 0 ? (
        <div className="text-xs text-flex-muted">Aucune session active.</div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-flex-border bg-flex-panel px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-flex-muted">
                    #{s.id.slice(0, 8)}
                  </span>
                  {s.current && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      ● Session actuelle
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-flex-muted">
                  Ouverte le {formatDateTime(s.createdAt)} · expire le{" "}
                  {formatDateTime(s.expiresAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(s.id, s.current)}
                disabled={busyId === s.id}
                className="rounded-lg bg-flex-panel px-3 py-1.5 text-xs font-semibold text-flex-text transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
              >
                {busyId === s.id
                  ? "…"
                  : s.current
                    ? "Me déconnecter"
                    : "Déconnecter"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
