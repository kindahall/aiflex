"use client";

import { useCallback, useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import type { User, UserRole } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer définitivement ce compte et tous ses projets ?"))
      return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function resetPassword(user: User) {
    const newPassword = prompt(
      `Nouveau mot de passe pour ${user.email} (6 caractères minimum) :`
    );
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(
        `Mot de passe réinitialisé pour ${user.email}. Transmets-lui de manière sécurisée.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  });

  if (loading) return <LoadingPulse label="Chargement des utilisateurs" />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Utilisateurs</h2>
          <p className="text-sm text-flex-muted">
            {users.length} compte{users.length > 1 ? "s" : ""} sur la
            plateforme
          </p>
        </div>
        <input
          type="search"
          placeholder="Rechercher par nom ou email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-flex-border bg-flex-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-flex-border bg-flex-panel text-[10px] uppercase tracking-widest text-flex-muted">
            <tr>
              <th className="px-4 py-3">Créateur</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Inscription</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isMe = me?.id === u.id;
              return (
                <tr
                  key={u.id}
                  className="border-b border-flex-border last:border-0 hover:bg-flex-panel/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flex-accent font-bold text-white">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{u.name}</div>
                        <div className="truncate text-xs text-flex-muted">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) =>
                        patch(u.id, { role: e.target.value as UserRole })
                      }
                      className="!w-auto !py-1.5 !text-xs"
                    >
                      <option value="user">Créateur</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.suspended ? (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
                        Suspendu
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        Actif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-flex-muted">
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => resetPassword(u)}
                        className="rounded-lg bg-flex-panel px-3 py-1.5 text-[11px] font-semibold text-flex-text transition hover:bg-flex-border"
                      >
                        🔑 Mot de passe
                      </button>
                      {!isMe && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              patch(u.id, { suspended: !u.suspended })
                            }
                            className="rounded-lg bg-flex-panel px-3 py-1.5 text-[11px] font-semibold text-flex-text transition hover:bg-flex-border"
                          >
                            {u.suspended ? "Réactiver" : "Suspendre"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(u.id)}
                            className="rounded-lg border border-flex-border bg-flex-panel px-2 py-1.5 text-[11px] text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                      {isMe && (
                        <span className="text-[11px] text-flex-muted">
                          Toi
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-flex-muted"
                >
                  Aucun utilisateur ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
