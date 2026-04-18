"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";

const DISMISSED_KEY = "aiflex_push_dismissed";

/**
 * Dismissible banner prompting the user to enable push notifications.
 * Shows only when:
 * - The user is logged in
 * - The browser supports push + service workers
 * - The user hasn't already subscribed or dismissed
 */
export default function PushNotificationPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) setShow(true);
      })
      .catch(() => {});
  }, [user]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get VAPID key
      const vapidRes = await fetch("/api/push/vapid-key");
      if (!vapidRes.ok) throw new Error("VAPID key unavailable");
      const { vapidPublicKey } = await vapidRes.json();

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 3. Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys) throw new Error("Invalid subscription");

      // 4. Save to backend
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        }),
      });

      setShow(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[AIflex] Push subscription failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mx-auto mb-4 flex max-w-4xl items-center gap-4 rounded-xl border border-flex-accent/30 bg-flex-accent/5 px-5 py-3">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-flex-accent"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <p className="flex-1 text-sm text-flex-text">
        Activer les notifications push pour ne rien manquer
      </p>
      <button
        type="button"
        onClick={subscribe}
        disabled={loading}
        className="rounded-lg bg-flex-accent px-4 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "..." : "Activer"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs font-semibold text-flex-muted transition hover:text-flex-text"
      >
        Plus tard
      </button>
    </div>
  );
}

/** Convert a URL-safe base64 VAPID key to a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
