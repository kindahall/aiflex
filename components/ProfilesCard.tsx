"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ProfileItem {
  id: string;
  name: string;
  avatarSeed?: string;
  isChild: boolean;
  maxRating: string;
}

function initial(name: string): string {
  return name.trim()[0]?.toUpperCase() || "?";
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 45%)`;
}

/**
 * Multi-profiles summary card. Most people won't use this, but the
 * parental / kids profile system exists and needs a dashboard entry so
 * accounts can see at a glance how many profiles they've set up.
 */
export default function ProfilesCard() {
  const [profiles, setProfiles] = useState<ProfileItem[] | null>(null);

  useEffect(() => {
    fetch("/api/profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles || []))
      .catch(() => setProfiles([]));
  }, []);

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5 shadow-cinema">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
            Profils du compte
          </div>
          <h3 className="text-base font-bold">Mes profils</h3>
        </div>
        <Link
          href="/profiles"
          className="shrink-0 rounded-lg bg-flex-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-flex-text transition hover:bg-flex-border"
        >
          Gérer →
        </Link>
      </div>
      {profiles === null ? (
        <div className="text-xs text-flex-muted">Chargement…</div>
      ) : profiles.length === 0 ? (
        <p className="text-xs text-flex-muted">
          Aucun profil créé. Ajoute un profil enfant pour filtrer le contenu.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-flex-border bg-flex-panel/60 px-2 py-1"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white"
                style={{ backgroundColor: colorFor(p.avatarSeed || p.name) }}
              >
                {initial(p.name)}
              </span>
              <span className="text-xs font-semibold">{p.name}</span>
              {p.isChild && (
                <span className="rounded bg-flex-accent2/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-flex-accent2">
                  Enfant
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
