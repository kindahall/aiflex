"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";

export default function AdminSecurityPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<null | {
    type: "ok" | "err";
    msg: string;
  }>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ type: "err", msg: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: "err", msg: "6 caractères minimum." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setStatus({ type: "ok", msg: "Mot de passe mis à jour avec succès." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setStatus({
        type: "err",
        msg: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
          Mon compte admin
        </div>
        <h2 className="text-2xl font-black">Changer mon mot de passe</h2>
        <p className="mt-1 text-sm text-flex-muted">
          Connecté en tant que{" "}
          <span className="font-semibold text-flex-text">{user?.email}</span>.
          Ton identifiant d'origine a été défini via les variables
          d'environnement <code className="font-mono text-flex-text">ADMIN_EMAIL</code>{" "}
          et <code className="font-mono text-flex-text">ADMIN_PASSWORD</code>.
          Le mot de passe doit faire au moins 6 caractères — change-le dès
          maintenant pour sécuriser la plateforme.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6"
      >
        <div>
          <label htmlFor="current">Mot de passe actuel</label>
          <input
            id="current"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label htmlFor="new">Nouveau mot de passe</label>
          <input
            id="new"
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="6 caractères minimum"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="confirm">Confirmer le nouveau mot de passe</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
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
          className="rounded-xl bg-flex-accent px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Mise à jour…" : "Mettre à jour"}
        </button>
      </form>

      <div className="rounded-2xl border border-flex-border bg-flex-panel p-6 text-sm text-flex-muted">
        <div className="mb-2 font-bold uppercase tracking-widest text-flex-text">
          💡 Créer un second admin
        </div>
        <p className="mb-3">
          Pour créer un nouvel administrateur : demande à la personne de
          s'inscrire via{" "}
          <a href="/login" className="text-flex-accent underline">
            /login
          </a>
          , puis va dans{" "}
          <a href="/admin/users" className="text-flex-accent underline">
            Utilisateurs
          </a>{" "}
          et change son rôle en <strong>Admin</strong>. Tu peux aussi lui
          définir un mot de passe initial depuis la même page (bouton{" "}
          <em>Réinitialiser le mot de passe</em>).
        </p>
        <p>
          ⚠ Si tu perds ton mot de passe admin, arrête le serveur, supprime{" "}
          <code className="font-mono text-flex-text">.data/db.json</code> (ou
          le user concerné dedans) et relance —{" "}
          <code className="font-mono text-flex-text">ADMIN_PASSWORD</code> de{" "}
          <code className="font-mono text-flex-text">.env.local</code> sera
          re-seedé.
        </p>
      </div>
    </div>
  );
}
