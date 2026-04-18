"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import type { Notification } from "@/lib/types";

/**
 * Bell icon in the navbar with an unread count badge and a dropdown panel
 * listing the latest notifications. Polls on mount and on every
 * `aiflex:auth-changed` event (login, logout) so the count is always
 * fresh after navigation.
 *
 * No WebSocket / SSE — we do a simple GET on mount. The user sees live
 * updates when they navigate or click the bell. Good enough for the
 * prototype; upgrade to SSE or Supabase Realtime once we have infra.
 */

const ICON_KIND: Record<string, string> = {
  like: "♥",
  comment: "💬",
  remix: "↻",
  "video-ready": "🎬",
  system: "ℹ",
};

export default function NotificationBell() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      const data = await res.json();
      if (data.notifications) {
        setNotifications(data.notifications);
        setUnread(data.unread ?? 0);
      }
    } catch {
      // Silent — bell just won't show new notifs
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("aiflex:auth-changed", handler);
    return () => window.removeEventListener("aiflex:auth-changed", handler);
  }, [refresh]);

  async function markAllRead() {
    try {
      await fetch("/api/me/notifications", { method: "POST" });
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silent
    }
  }

  async function markOneRead(id: string) {
    try {
      await fetch(`/api/me/notifications/${id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      // Silent
    }
  }

  if (loading || !user) return null;

  return (
    <div className="relative ml-1">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-flex-border/50 bg-flex-panel text-flex-text transition hover:bg-flex-muted/10"
        aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-flex-accent px-1 text-[9px] font-black text-white shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-flex-border bg-flex-card shadow-cinema">
            <div className="flex items-center justify-between border-b border-flex-border px-4 py-3">
              <div className="text-sm font-bold">Notifications</div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[10px] font-semibold text-flex-accent hover:underline"
                >
                  Tout marquer lu
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-flex-muted">
                Aucune notification pour l&apos;instant.
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notifications.slice(0, 20).map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-flex-border last:border-0 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (!n.read) markOneRead(n.id);
                          setOpen(false);
                        }}
                        className="flex items-start gap-3 px-4 py-3 transition hover:bg-flex-panel"
                      >
                        <NotifContent n={n} />
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-4 py-3">
                        <NotifContent n={n} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-flex-border px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-flex-accent transition hover:bg-flex-panel"
            >
              Voir tout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function NotifContent({ n }: { n: Notification }) {
  return (
    <>
      <span className="mt-0.5 shrink-0 text-lg">
        {ICON_KIND[n.kind] || "📣"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs leading-snug text-flex-text">
          {n.message}
        </div>
        <div className="mt-0.5 text-[10px] text-flex-muted">
          {formatRelative(n.createdAt)}
        </div>
      </div>
      {!n.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-flex-accent" />
      )}
    </>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "à l'instant";
  if (diff < hour) return `il y a ${Math.floor(diff / min)} min`;
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`;
  return new Date(ts).toLocaleDateString("fr-FR");
}
