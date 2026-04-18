"use client";

import { useState } from "react";

/**
 * DMCA takedown request form (V8 §26.2). Submits to /api/legal/dmca
 * which creates a `Report` row with reason="copyright" and high priority,
 * plus a `DMCANotice` for full audit retention.
 */
export default function DMCAForm() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/legal/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantName: data.get("claimantName"),
          claimantEmail: data.get("claimantEmail"),
          targetProjectId: extractIdFromUrl(String(data.get("targetUrl") || "")),
          copyrightWork: data.get("copyrightWork"),
          goodFaithStmt: data.get("goodFaithStmt") === "on",
          signature: data.get("signature"),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Échec de l'envoi");
      }
      setSuccess(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-400">
        ✓ Ta demande DMCA a bien été reçue. Un membre de l&apos;équipe légale
        te répondra sous 24h ouvrées à l&apos;adresse indiquée.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-flex-border bg-flex-panel p-6">
      <Field label="Ton nom complet" name="claimantName" required />
      <Field label="Email de contact" name="claimantEmail" type="email" required />
      <Field
        label="URL complète du contenu sur AIflex"
        name="targetUrl"
        placeholder="https://aiflex.com/watch/..."
        required
      />
      <Field
        label="Description de l'œuvre originale que tu revendiques"
        name="copyrightWork"
        textarea
        required
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="goodFaithStmt"
          required
          className="mt-1 h-4 w-4 rounded border-flex-border text-flex-accent"
        />
        <span className="text-flex-muted">
          Je déclare de bonne foi que l&apos;utilisation du contenu n&apos;est pas
          autorisée par l&apos;ayant-droit, son représentant, ni par la loi,
          et que les informations fournies sont exactes sous peine de
          parjure.
        </span>
      </label>
      <Field
        label="Signature électronique (tape ton nom)"
        name="signature"
        required
      />
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-flex-accent px-6 py-3 font-medium text-white hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? "Envoi…" : "Envoyer la demande DMCA"}
      </button>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}

function Field({ label, name, type = "text", placeholder, required, textarea }: FieldProps) {
  const cls =
    "w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-flex-accent focus:outline-none";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-flex-muted">
        {label} {required && <span className="text-flex-accent">*</span>}
      </label>
      {textarea ? (
        <textarea name={name} rows={3} required={required} className={`${cls} resize-none`} />
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function extractIdFromUrl(url: string): string {
  // /watch/abc123 → abc123
  const m = url.match(/\/watch\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : url;
}
