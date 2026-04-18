"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";

/**
 * Collapsible card to change the account's email address. Requires the
 * current password. On success, the account goes back to "not verified"
 * and a fresh verification email is sent to the new address.
 */
export default function ChangeEmailCard() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | {
    type: "ok" | "err";
    msg: string;
  }>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await refresh();
      setStatus({
        type: "ok",
        msg: "Adresse mise à jour. Vérifie ta nouvelle boîte mail pour confirmer.",
      });
      toast("success", "Email mis à jour");
      setNewEmail("");
      setCurrentPassword("");
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
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
            Identité
          </div>
          <div className="text-base font-bold">Changer mon adresse email</div>
        </div>
        <span className="text-flex-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 animate-fadeUp">
          <p className="text-xs text-flex-muted">
            Adresse actuelle : <strong>{user.email}</strong>. Un lien de
            vérification sera envoyé à la nouvelle adresse.
          </p>
          <div>
            <label htmlFor="email-new">Nouvelle adresse email</label>
            <input
              id="email-new"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="email-password">Mot de passe actuel</label>
            <input
              id="email-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
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
            className="w-full rounded-lg bg-flex-accent py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Mettre à jour"}
          </button>
        </form>
      )}
    </div>
  );
}
