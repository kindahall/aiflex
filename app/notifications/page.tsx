"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { useAuth } from "@/lib/useAuth";
import type { Notification } from "@/lib/types";

const ICON_KIND: Record<string, string> = {
  like: "♥",
  comment: "💬",
  remix: "↻",
  "video-ready": "🎬",
  system: "ℹ",
};

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.push("/login?next=/notifications");
  }, [loading, user, router]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      const data = await res.json();
      setNotifs(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      setNotifs([]);
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  async function markAllRead() {
    await fetch("/api/me/notifications", { method: "POST" });
    setUnread(0);
    setNotifs((prev) => prev?.map((n) => ({ ...n, read: true })) || null);
  }

  async function markOneRead(id: string) {
    await fetch(`/api/me/notifications/${id}`, { method: "PATCH" });
    setNotifs((prev) =>
      prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) || null
    );
    setUnread((c) => Math.max(0, c - 1));
  }

  if (loading || !user || notifs === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <LoadingPulse label="Chargement des notifications" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <PushNotificationPrompt />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
            Centre de notifications
          </div>
          <h1 className="text-4xl font-black tracking-tight">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-flex-muted">
            {unread > 0
              ? `${unread} non lue${unread > 1 ? "s" : ""}`
              : "Toutes lues"}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-lg bg-flex-text px-4 py-2 text-xs font-bold text-flex-bg transition hover:opacity-90"
          >
            Tout marquer lu
          </button>
        )}
      </div>

      {notifs.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🔔</div>
          <h3 className="mb-2 text-xl font-bold">Rien de nouveau</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Quand quelqu&apos;un aime, commente ou remixe tes films,
            ça apparaîtra ici.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white"
          >
            Explorer le feed
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifs.map((n) => (
            <li key={n.id}>
              {n.href ? (
                <Link
                  href={n.href}
                  onClick={() => {
                    if (!n.read) markOneRead(n.id);
                  }}
                  className={`flex items-start gap-4 rounded-2xl border p-5 transition hover:border-flex-accent ${
                    n.read
                      ? "border-flex-border bg-flex-card opacity-60"
                      : "border-flex-accent/30 bg-flex-accent/5"
                  }`}
                >
                  <NotifRow n={n} />
                </Link>
              ) : (
                <div
                  className={`flex items-start gap-4 rounded-2xl border p-5 ${
                    n.read
                      ? "border-flex-border bg-flex-card opacity-60"
                      : "border-flex-accent/30 bg-flex-accent/5"
                  }`}
                >
                  <NotifRow n={n} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotifRow({ n }: { n: Notification }) {
  return (
    <>
      <span className="mt-0.5 shrink-0 text-2xl">
        {ICON_KIND[n.kind] || "📣"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug text-flex-text">{n.message}</div>
        {n.actorName && (
          <div className="mt-1 text-[10px] text-flex-muted">
            par{" "}
            <Link
              href={`/u/${n.actorId}`}
              className="font-semibold text-flex-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {n.actorName}
            </Link>
          </div>
        )}
        <div className="mt-1 text-[10px] text-flex-muted">
          {new Date(n.createdAt).toLocaleString("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      {!n.read && (
        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-flex-accent" />
      )}
    </>
  );
}
