"use client";

import { useCallback, useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import type { Project } from "@/lib/types";

interface AdminProject extends Project {
  ownerName: string;
  ownerEmail: string;
}

type Filter = "all" | "public" | "private" | "drafts";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProjects(data.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unpublish(p: AdminProject) {
    try {
      const res = await fetch(`/api/admin/projects/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "private", published: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(p: AdminProject) {
    if (!confirm(`Supprimer "${p.concept?.title || p.idea}" ?`)) return;
    try {
      const res = await fetch(`/api/admin/projects/${p.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const filtered = projects.filter((p) => {
    if (filter === "public" && !(p.published && p.visibility === "public"))
      return false;
    if (filter === "private" && (p.published || p.visibility === "public"))
      return false;
    if (filter === "drafts" && p.stage !== "idea" && p.stage !== "concept")
      return false;
    if (query) {
      const q = query.toLowerCase();
      const hit =
        (p.concept?.title || "").toLowerCase().includes(q) ||
        p.idea.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.ownerEmail.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  if (loading) return <LoadingPulse label="Chargement des projets" />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Projets</h2>
          <p className="text-sm text-flex-muted">
            {projects.length} projet{projects.length > 1 ? "s" : ""} sur la
            plateforme
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="!w-auto"
          >
            <option value="all">Tous</option>
            <option value="public">Publics</option>
            <option value="private">Privés</option>
            <option value="drafts">Brouillons</option>
          </select>
          <input
            type="search"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="!w-64"
          />
        </div>
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
              <th className="px-4 py-3">Projet</th>
              <th className="px-4 py-3">Créateur</th>
              <th className="px-4 py-3">Étape</th>
              <th className="px-4 py-3">Visibilité</th>
              <th className="px-4 py-3">Scènes / Vidéos</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isPublic = p.published && p.visibility === "public";
              const sceneCount = p.scenes?.length || 0;
              const videoCount =
                p.scenes?.filter((s) => s.videoUrl).length || 0;
              return (
                <tr
                  key={p.id}
                  className="border-b border-flex-border last:border-0 hover:bg-flex-panel/50"
                >
                  <td className="px-4 py-3">
                    <div className="max-w-xs">
                      <div className="truncate font-semibold">
                        {p.concept?.title || "Sans titre"}
                      </div>
                      <div className="truncate text-xs text-flex-muted">
                        {p.concept?.logline || p.idea}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.ownerName}</div>
                    <div className="text-xs text-flex-muted">
                      {p.ownerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-flex-accent2/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-accent2">
                      {p.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isPublic ? (
                      <span className="rounded-full bg-flex-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-accent">
                        Public
                      </span>
                    ) : (
                      <span className="rounded-full bg-flex-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flex-muted">
                        Privé
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-flex-muted">
                    {sceneCount} / {videoCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {isPublic && (
                        <button
                          type="button"
                          onClick={() => unpublish(p)}
                          className="rounded-lg bg-flex-panel px-3 py-1.5 text-[11px] font-semibold text-flex-text transition hover:bg-flex-border"
                        >
                          Dépublier
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        className="rounded-lg border border-flex-border bg-flex-panel px-2 py-1.5 text-[11px] text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-flex-muted"
                >
                  Aucun projet ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
