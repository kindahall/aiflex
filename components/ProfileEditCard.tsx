"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";

const BIO_MAX = 280;

/**
 * Self-service edit of the current user's display name + public bio.
 * Mounted on the dashboard. Persists via PATCH /api/me/profile and
 * triggers a global auth refresh so the navbar avatar updates instantly.
 */
export default function ProfileEditCard() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | {
    type: "ok" | "err";
    msg: string;
  }>(null);

  // Hydrate the form from the current user every time it changes.
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    // The User type used by useAuth is the public one — bio may or may not
    // be present depending on whether the server returned it. We re-fetch
    // /api/auth/me lazily on mount via useAuth, so this is consistent.
    setBio(((user as { bio?: string }).bio) || "");
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await refresh();
      setStatus({ type: "ok", msg: "Profil mis à jour." });
      toast("success", "Profil mis à jour");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setStatus({ type: "err", msg });
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema"
    >
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
          Mon profil public
        </div>
        <h3 className="text-xl font-black">Identité de créateur</h3>
        <p className="mt-1 text-xs text-flex-muted">
          Ces infos sont visibles sur ta page créateur{" "}
          <code className="font-mono text-flex-text">/u/{user.id}</code>.
        </p>
      </div>

      <div>
        <label htmlFor="profile-name">Nom public</label>
        <input
          id="profile-name"
          type="text"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="profile-bio">Bio (optionnel)</label>
        <textarea
          id="profile-bio"
          rows={3}
          maxLength={BIO_MAX}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Une phrase ou deux pour te présenter aux autres créateurs."
        />
        <div className="mt-1 text-right text-[10px] text-flex-muted">
          {bio.length} / {BIO_MAX}
        </div>
      </div>

      {status && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            status.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {status.type === "ok" ? "✓ " : "⚠ "}
          {status.msg}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-flex-accent px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
