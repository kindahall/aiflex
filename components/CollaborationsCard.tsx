"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CollabItem {
  id: string;
  title: string;
  coverUrl?: string;
  stage: string;
  role: "viewer" | "editor" | null;
  ownerName: string;
  ownerId: string;
}

const STAGE_SHORT: Record<string, string> = {
  idea: "Idée",
  concept: "Concept",
  scenario: "Scénario",
  scenes: "Scènes",
  visuals: "Visuels",
  assembly: "Assemblage",
  published: "Publié",
};

/**
 * Projects the user has been invited to as viewer or editor. Hidden when
 * empty so it doesn't clutter the dashboard for solo creators.
 */
export default function CollaborationsCard() {
  const [items, setItems] = useState<CollabItem[] | null>(null);

  useEffect(() => {
    fetch("/api/me/collaborations", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.collaborations || []))
      .catch(() => setItems([]));
  }, []);

  if (items === null) {
    return (
      <div className="rounded-2xl border border-flex-border bg-flex-card p-5 shadow-cinema">
        <div className="text-xs text-flex-muted">Chargement…</div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5 shadow-cinema">
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
          Équipe
        </div>
        <h3 className="text-base font-bold">
          Projets collaboratifs ({items.length})
        </h3>
        <p className="mt-1 text-[11px] text-flex-muted">
          Projets où tu as été invité comme collaborateur.
        </p>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 4).map((p) => (
          <li key={p.id}>
            <Link
              href={`/studio/${p.id}`}
              className="flex items-center gap-3 rounded-lg border border-flex-border bg-flex-panel/60 px-3 py-2 transition hover:border-flex-accent/40"
            >
              <div
                className="h-10 w-16 shrink-0 rounded bg-cover bg-center ring-1 ring-flex-border"
                style={{
                  backgroundImage: `url(${
                    p.coverUrl || `https://picsum.photos/seed/${p.id}/160/90`
                  })`,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-flex-muted">
                  <span className="rounded bg-flex-accent/20 px-1.5 py-0.5 font-bold uppercase tracking-widest text-flex-accent">
                    {p.role === "editor" ? "✎ Éditeur" : "👁 Lecteur"}
                  </span>
                  <span>·</span>
                  <span>par {p.ownerName}</span>
                  <span>·</span>
                  <span>{STAGE_SHORT[p.stage] || p.stage}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
