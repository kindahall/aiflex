"use client";

import { useState } from "react";

interface Candidate {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface SplitRow {
  userId: string;
  name: string;
  percent: number;
}

interface Props {
  projectId: string;
  candidates: Candidate[];
  initial: SplitRow[];
}

/**
 * Edit CollaboratorSplit rows for a project (V8 §23.6).
 *
 * UX rules:
 *   - Sum displayed live; > 100 disables Save.
 *   - Owner share = 100 - sum, shown but not editable.
 *   - Adding a collaborator is gated by them existing in the Collaborator
 *     table — direct integration with /dashboard's invite flow.
 */
export default function CollabSplitsForm({ projectId, candidates, initial }: Props) {
  const [rows, setRows] = useState<SplitRow[]>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sum = rows.reduce((acc, r) => acc + Math.max(0, r.percent), 0);
  const ownerShare = Math.max(0, 100 - sum);
  const overflow = sum > 100;

  function updatePercent(userId: string, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.userId === userId ? { ...r, percent: Math.max(0, Math.min(100, Math.floor(value))) } : r
      )
    );
  }

  function addRow(userId: string) {
    const cand = candidates.find((c) => c.userId === userId);
    if (!cand) return;
    if (rows.some((r) => r.userId === userId)) return;
    setRows((prev) => [...prev, { userId: cand.userId, name: cand.name, percent: 10 }]);
  }

  function removeRow(userId: string) {
    setRows((prev) => prev.filter((r) => r.userId !== userId));
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splits: rows.map((r) => ({ userId: r.userId, percent: r.percent })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  const remainingCandidates = candidates.filter(
    (c) => !rows.some((r) => r.userId === c.userId)
  );

  return (
    <div className="space-y-6 rounded-3xl border border-flex-border bg-flex-panel p-6 sm:p-8 shadow-cinema">
      {rows.length === 0 ? (
        <p className="text-sm text-flex-muted">
          Aucun partage configuré. Tu gardes 100% des revenus créateur.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.userId}
              className="flex items-center gap-3 rounded-2xl bg-flex-card p-3"
            >
              <div className="flex-1">
                <div className="font-medium">{r.name}</div>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={r.percent}
                onChange={(e) => updatePercent(r.userId, Number(e.target.value))}
                className="w-20 rounded-lg border border-flex-border bg-flex-surface px-2 py-1 text-right text-sm"
              />
              <span className="text-sm text-flex-muted">%</span>
              <button
                type="button"
                onClick={() => removeRow(r.userId)}
                aria-label="Retirer"
                className="ml-2 text-flex-muted hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {remainingCandidates.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
            Ajouter un collaborateur
          </label>
          <select
            onChange={(e) => {
              if (e.target.value) addRow(e.target.value);
              e.currentTarget.value = "";
            }}
            className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
            defaultValue=""
          >
            <option value="">Choisir…</option>
            {remainingCandidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} · {c.role}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-2xl border border-flex-border bg-flex-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Toi (créateur principal)</span>
          <span className={`font-display text-xl font-bold ${overflow ? "text-red-400" : "text-flex-accent"}`}>
            {ownerShare}%
          </span>
        </div>
        {overflow && (
          <div className="mt-2 text-xs text-red-400">
            La somme des parts ({sum}%) dépasse 100%. Réduis pour pouvoir sauvegarder.
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          ✓ Sauvegardé
        </div>
      )}

      <div className="flex justify-end border-t border-flex-border pt-4">
        <button
          onClick={save}
          disabled={pending || overflow}
          className="rounded-full bg-flex-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}
