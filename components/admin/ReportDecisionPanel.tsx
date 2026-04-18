"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  reportId: string;
  severity: string;
}

const ACTIONS = [
  { id: "removed", label: "Retirer le contenu", cls: "bg-red-600 hover:brightness-110" },
  { id: "warned", label: "Avertir l'auteur", cls: "bg-amber-600 hover:brightness-110" },
  { id: "suspended", label: "Suspendre l'auteur", cls: "bg-red-700 hover:brightness-110" },
  { id: "none", label: "Rejeter le signalement", cls: "bg-flex-card border border-flex-border hover:bg-flex-panel" },
] as const;

export default function ReportDecisionPanel({ reportId, severity }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: string) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {severity === "csam" && (
        <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          ⚠️ Contenu déjà quarantiné automatiquement.
        </div>
      )}
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          onClick={() => decide(a.id)}
          disabled={pending !== null}
          className={`w-full rounded-full px-4 py-2 text-xs font-medium text-white disabled:opacity-50 ${a.cls}`}
        >
          {pending === a.id ? "…" : a.label}
        </button>
      ))}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
