import "server-only";
import { getPushSubscriptionsForUser } from "./server-db";

/**
 * Web Push notification helper for AIflex.
 *
 * Real delivery is handled by the `web-push` npm package (optional dep —
 * see package.json "//deps-to-add-as-features-land" → pwa-push). If the
 * package isn't installed or VAPID keys are missing, the module no-ops
 * gracefully and logs the reason once per call.
 *
 * To enable:
 *   1. npm install web-push
 *   2. npx web-push generate-vapid-keys
 *   3. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL env vars
 */

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@aiflex.local";

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isWebPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

interface PushSubscriptionShape {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Typed surface of the bits of `web-push` we use — keeps the optional-dep
// cast contained and easy to read.
interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: PushSubscriptionShape,
    payload: string,
    options?: { TTL?: number }
  ) => Promise<{ statusCode: number }>;
}

let webPushModule: WebPushModule | null = null;
let webPushInitTried = false;

async function getWebPush(): Promise<WebPushModule | null> {
  if (webPushModule) return webPushModule;
  if (webPushInitTried) return null;
  webPushInitTried = true;

  try {
    const mod = await import("web-push").catch(() => null);
    if (!mod) return null;
    const wp = ((mod as unknown as { default?: WebPushModule }).default ??
      (mod as unknown as WebPushModule)) as WebPushModule;
    wp.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushModule = wp;
    return wp;
  } catch {
    return null;
  }
}

/**
 * Send a push notification to all registered devices for a user.
 * No-ops gracefully if VAPID keys are missing or web-push isn't installed.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!isWebPushConfigured()) {
    // eslint-disable-next-line no-console
    console.debug(
      "[AIflex] Web Push non configuré (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants)."
    );
    return;
  }

  const wp = await getWebPush();
  if (!wp) {
    // eslint-disable-next-line no-console
    console.warn(
      "[AIflex] web-push package non installé — push ignoré. `npm install web-push` pour activer."
    );
    return;
  }

  const subscriptions = await getPushSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    icon: payload.icon || "/favicon.svg",
  });

  await Promise.allSettled(
    subscriptions.map((sub) =>
      wp
        .sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          { TTL: 86400 }
        )
        .catch((err: unknown) => {
          // 404/410 = subscription gone; caller should prune but we don't
          // want a single dead device to fail the whole batch.
          // eslint-disable-next-line no-console
          console.warn(
            `[AIflex] Push delivery failed: ${sub.endpoint.slice(0, 60)}…`,
            err
          );
        })
    )
  );
}
