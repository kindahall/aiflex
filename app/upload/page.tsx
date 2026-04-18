"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * User upload page (V7 §7). The user picks a file, fills a bit of metadata,
 * and we delegate to /api/upload/file which:
 *   - writes to B2
 *   - probes duration (public) or uses file size (private)
 *   - creates a Project row
 *   - returns a Stripe Checkout URL we redirect to
 *
 * After Stripe completes, the webhook flips the Project status.
 */
export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("drama");
  const [visibility, setVisibility] = useState<"private" | "private_circle" | "public">("private");
  const [invitedEmails, setInvitedEmails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choisis un fichier vidéo.");
      return;
    }
    if (!title.trim()) {
      setError("Titre requis.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fichier trop volumineux (max 5 GB).");
      return;
    }

    setSubmitting(true);
    setProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("originalFileName", file.name);
      form.append("title", title);
      form.append("synopsis", synopsis);
      form.append("genre", genre);
      form.append("visibility", visibility);
      if (visibility === "private_circle") {
        const emails = invitedEmails
          .split(/[\s,;]+/)
          .map((e) => e.trim())
          .filter(Boolean);
        form.append("invitedEmails", JSON.stringify(emails));
      }

      // Use XHR to get upload progress (fetch doesn't expose it)
      const xhr = new XMLHttpRequest();
      const completion = new Promise<{ checkoutUrl: string }>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || `HTTP ${xhr.status}`));
            }
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Réponse invalide"));
          }
        };
        xhr.onerror = () => reject(new Error("Erreur réseau"));
      });
      xhr.open("POST", "/api/upload/file");
      xhr.send(form);
      const data = await completion;
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSubmitting(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  }

  if (authLoading) {
    return <Centered>Chargement…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        Connecte-toi.{" "}
        <Link href="/login?redirect=/upload" className="text-flex-accent underline">
          Se connecter
        </Link>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/studio"
        className="mb-6 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Retour au studio
      </Link>

      <header className="mb-10 animate-fadeUp">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Upload
        </div>
        <h1 className="font-display text-4xl font-bold">Publier ta vidéo</h1>
        <p className="mt-2 max-w-xl text-flex-muted">
          Partage une vidéo que tu as déjà tournée. Mode privé (cercle
          d&apos;amis) ou public — dans ce cas soumis à modération avant
          publication sur le catalogue.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-8 rounded-3xl border border-flex-border bg-flex-panel p-8 shadow-cinema sm:p-10"
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed p-10 text-center transition ${
            dragOver
              ? "border-flex-accent bg-flex-accent/10"
              : "border-flex-border bg-flex-card hover:border-flex-accent/50"
          }`}
        >
          <div className="text-4xl">🎞️</div>
          {file ? (
            <>
              <div className="font-medium">{file.name}</div>
              <div className="text-xs text-flex-muted">
                {(file.size / (1024 * 1024)).toFixed(1)} MB ·{" "}
                {file.type || "type inconnu"}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setFile(null);
                }}
                className="text-xs text-flex-accent underline"
              >
                Choisir un autre fichier
              </button>
            </>
          ) : (
            <>
              <div className="font-medium">Glisse ton fichier ici</div>
              <div className="text-xs text-flex-muted">
                MP4, MOV, MKV, WebM · max 5 GB
              </div>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </>
          )}
        </label>

        <Field label="Titre" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
          />
        </Field>

        <Field label="Synopsis">
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={3}
            maxLength={800}
            className="w-full resize-none rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
          />
        </Field>

        <Field label="Genre">
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
          >
            {["drama", "comedy", "thriller", "sci-fi", "fantasy", "horror", "documentary", "romance", "action", "animation"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Visibilité">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                { v: "private", label: "Privé", desc: "Seul toi", icon: "🔒" },
                { v: "private_circle", label: "Cercle privé", desc: "Invités uniquement", icon: "👥" },
                { v: "public", label: "Public", desc: "Catalogue (review admin)", icon: "🌐" },
              ] as const
            ).map((opt) => (
              <button
                type="button"
                key={opt.v}
                onClick={() => setVisibility(opt.v)}
                className={`rounded-2xl border p-4 text-left transition ${
                  visibility === opt.v
                    ? "border-flex-accent bg-flex-accent/10"
                    : "border-flex-border bg-flex-card hover:border-flex-accent/50"
                }`}
              >
                <div className="text-xl">{opt.icon}</div>
                <div className="mt-1 font-medium">{opt.label}</div>
                <div className="text-xs text-flex-muted">{opt.desc}</div>
              </button>
            ))}
          </div>
        </Field>

        {visibility === "private_circle" && (
          <Field label="Emails invités (séparés par virgule ou retour à la ligne)">
            <textarea
              value={invitedEmails}
              onChange={(e) => setInvitedEmails(e.target.value)}
              rows={3}
              placeholder="alice@x.com, bob@y.com"
              className="w-full resize-none rounded-xl border border-flex-border bg-flex-surface px-3 py-2 focus:border-flex-accent focus:outline-none"
            />
          </Field>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {submitting && progress > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs text-flex-muted">
              <span>Envoi du fichier…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-flex-card">
              <div
                className="h-full bg-gradient-to-r from-flex-accent to-flex-accent2 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-flex-border pt-6">
          <Link href="/studio" className="text-sm text-flex-muted hover:text-flex-text">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={submitting || !file}
            className="rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-6 py-3 font-medium text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Envoi…" : "Uploader et payer"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-flex-muted">
        Prix calculé après l&apos;envoi du fichier selon la durée (public) ou la
        taille (privé). Tu valides le prix sur la page Stripe avant de payer.
      </p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-flex-muted">
        {label} {required && <span className="text-flex-accent">*</span>}
      </label>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-flex-muted">
      {children}
    </div>
  );
}
