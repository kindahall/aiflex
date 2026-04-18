"use client";

import { useState } from "react";

const SEGMENTS = [
  { id: "all", label: "Tous (vérifiés + non suspendus)" },
  { id: "creators", label: "Créateurs (au moins 1 film public)" },
  { id: "subscribers_active", label: "Abonnés actifs (Light/Premium/Famille)" },
  { id: "inactive_14d", label: "Inactifs (pas de vue depuis 14j)" },
];

interface Result {
  segment: string;
  recipients: number;
  delivered: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
}

export default function BroadcastForm() {
  const [segment, setSegment] = useState("creators");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(dryRun: boolean) {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, subject, textBody, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 rounded-3xl border border-flex-border bg-flex-panel p-6 sm:p-8 shadow-cinema">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Segment
        </label>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
        >
          {SEGMENTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Sujet
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Corps du message (texte)
        </label>
        <textarea
          value={textBody}
          onChange={(e) => setTextBody(e.target.value)}
          rows={10}
          placeholder="Bonjour {{name}}, ..."
          className="w-full resize-y rounded-xl border border-flex-border bg-flex-surface px-3 py-2 font-mono text-sm focus:border-flex-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-flex-muted">
          Tokens disponibles : <code>{`{{name}}`}</code>, <code>{`{{email}}`}</code>
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-flex-border bg-flex-card p-4 text-sm">
          <div className="font-medium">
            {result.dryRun ? "Aperçu" : "Envoi terminé"}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-flex-muted">
            <li>Destinataires opt-in : {result.recipients}</li>
            <li>Skippés (sans consentement) : {result.skipped}</li>
            {!result.dryRun && (
              <>
                <li>Livrés : {result.delivered}</li>
                <li>Échecs : {result.failed}</li>
              </>
            )}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-flex-border pt-4">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={pending || !subject || !textBody}
          className="rounded-full border border-flex-border px-4 py-2 text-sm hover:bg-flex-card disabled:opacity-50"
        >
          Aperçu (dry run)
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending || !subject || !textBody}
          className="rounded-full bg-flex-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
