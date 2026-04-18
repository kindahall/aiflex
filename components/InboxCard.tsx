"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Participant {
  id: string;
  name: string;
  avatarSeed?: string;
}

interface Conversation {
  id: string;
  lastMessageAt: number;
  participants: Participant[];
}

const MAX = 3;

function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  const min = Math.round(delta / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.round(h / 24);
  return `il y a ${d}j`;
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
 * Latest conversations preview with unread badge. Full inbox at /messages.
 */
export default function InboxCard() {
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch("/api/messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setConvs((d.conversations || []).slice(0, MAX));
        setUnread(d.unread || 0);
      })
      .catch(() => setConvs([]));
  }, []);

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5 shadow-cinema">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
            Messages
          </div>
          <h3 className="flex items-center gap-2 text-base font-bold">
            Boîte de réception
            {unread > 0 && (
              <span className="rounded-full bg-flex-accent px-2 py-0.5 text-[10px] font-black text-white">
                {unread}
              </span>
            )}
          </h3>
        </div>
        <Link
          href="/messages"
          className="shrink-0 rounded-lg bg-flex-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-flex-text transition hover:bg-flex-border"
        >
          Ouvrir →
        </Link>
      </div>
      {convs === null ? (
        <div className="text-xs text-flex-muted">Chargement…</div>
      ) : convs.length === 0 ? (
        <p className="text-xs text-flex-muted">
          Aucune conversation. Envoie un message depuis le profil d'un créateur.
        </p>
      ) : (
        <ul className="space-y-2">
          {convs.map((c) => {
            const other = c.participants[0];
            if (!other) return null;
            return (
              <li key={c.id}>
                <Link
                  href={`/messages?c=${c.id}`}
                  className="flex items-center gap-3 rounded-lg border border-flex-border bg-flex-panel/60 px-3 py-2 transition hover:border-flex-accent/40"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                    style={{
                      backgroundColor: colorFor(other.avatarSeed || other.name),
                    }}
                  >
                    {initial(other.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {other.name}
                    </div>
                    <div className="text-[10px] text-flex-muted">
                      {formatRelative(c.lastMessageAt)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
