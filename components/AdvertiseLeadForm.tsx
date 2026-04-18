"use client";

import { useState } from "react";

const FORMATS = [
  { id: "preroll_15", label: "Pré-roll 15s" },
  { id: "midroll_30", label: "Mid-roll 30s" },
  { id: "banner", label: "Bannière" },
];

export default function AdvertiseLeadForm() {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>([]);

  function toggleFormat(id: string) {
    setFormats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/advertise/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.get("companyName"),
          contactName: data.get("contactName"),
          email: data.get("email"),
          phone: data.get("phone") || undefined,
          budgetCents: data.get("budgetUsd")
            ? Math.round(Number(data.get("budgetUsd")) * 100)
            : undefined,
          formats,
          message: data.get("message") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <div className="text-4xl">✓</div>
        <h3 className="mt-3 font-display text-xl font-semibold text-emerald-400">
          Demande reçue
        </h3>
        <p className="mt-2 text-sm text-flex-muted">
          Notre équipe pubs te recontacte sous 48h ouvrées.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-xl space-y-4 rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Société" name="companyName" required />
        <Field label="Ton nom" name="contactName" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" required />
        <Field label="Téléphone (optionnel)" name="phone" type="tel" />
      </div>
      <Field
        label="Budget mensuel estimé en USD (optionnel)"
        name="budgetUsd"
        type="number"
        placeholder="ex: 5000"
      />

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
          Formats d&apos;intérêt
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => toggleFormat(f.id)}
              className={`rounded-full border px-3 py-2 text-xs transition ${
                formats.includes(f.id)
                  ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
                  : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Message (optionnel)" name="message" textarea />

      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 py-3 text-sm font-medium text-white shadow-glow disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Demander un contact commercial"}
      </button>
      <p className="text-center text-[10px] text-flex-muted">
        Nous répondons à toutes les demandes sous 48h ouvrées.
      </p>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  placeholder?: string;
}

function Field({ label, name, type = "text", required, textarea, placeholder }: FieldProps) {
  const cls =
    "w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-flex-accent focus:outline-none";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-flex-muted">
        {label} {required && <span className="text-flex-accent">*</span>}
      </label>
      {textarea ? (
        <textarea name={name} rows={3} className={`${cls} resize-none`} placeholder={placeholder} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}
