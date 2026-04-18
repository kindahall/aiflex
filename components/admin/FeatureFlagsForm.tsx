"use client";

import { useState } from "react";

interface Props {
  initial: Record<string, boolean>;
  descriptions: Record<string, string>;
}

export default function FeatureFlagsForm({ initial, descriptions }: Props) {
  const [flags, setFlags] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string) {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: { [key]: next[key] } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      // Roll back
      setFlags(flags);
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {Object.entries(flags).map(([key, enabled]) => (
        <div
          key={key}
          className="flex items-start gap-4 rounded-2xl border border-flex-border bg-flex-panel p-4"
        >
          <div className="flex-1">
            <div className="font-medium">{key}</div>
            <p className="mt-1 text-xs text-flex-muted">
              {descriptions[key] ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggle(key)}
            disabled={saving}
            aria-pressed={enabled}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition disabled:opacity-50 ${
              enabled ? "bg-flex-accent" : "bg-flex-card"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      ))}

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="text-right text-xs text-flex-muted">
          Sauvegardé · propagation effective sous 30 s
        </div>
      )}
    </div>
  );
}
