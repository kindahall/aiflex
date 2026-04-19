import "server-only";
import { createNotification } from "./server-db";
import { sendPushToUser } from "./web-push";
import type { NotificationKind } from "./types";

/**
 * Rolling-window rate limit on notifications per (actor, recipient, kind).
 * A single abuser liking and un-liking every 2 seconds previously spammed
 * the recipient with push notifications — capped now to N/min.
 */
const NOTIFY_WINDOW_MS = 60 * 1000;
const NOTIFY_MAX_IN_WINDOW = 5;
const notifyBuckets = new Map<string, number[]>();

function shouldRateLimit(input: {
  userId: string;
  actorId?: string;
  kind: NotificationKind;
}): boolean {
  if (!input.actorId) return false;
  const k = `${input.actorId}→${input.userId}:${input.kind}`;
  const now = Date.now();
  const arr = (notifyBuckets.get(k) || []).filter((t) => now - t < NOTIFY_WINDOW_MS);
  if (arr.length >= NOTIFY_MAX_IN_WINDOW) {
    notifyBuckets.set(k, arr);
    return true;
  }
  arr.push(now);
  notifyBuckets.set(k, arr);
  return false;
}

/**
 * Create a DB notification AND send a push notification in one call.
 * Push is fire-and-forget — failures don't block the DB write.
 */
export async function notify(input: {
  userId: string;
  kind: NotificationKind;
  message: string;
  href?: string;
  actorId?: string;
  actorName?: string;
  projectId?: string;
}): Promise<void> {
  if (shouldRateLimit(input)) return;

  // Write to DB
  const notif = await createNotification(input);

  // Send push (fire-and-forget)
  if (notif) {
    sendPushToUser(input.userId, {
      title: pushTitle(input.kind),
      body: input.message,
      url: input.href || "/notifications",
    }).catch(() => {});
  }
}

function pushTitle(kind: NotificationKind): string {
  switch (kind) {
    case "like":
      return "Nouveau like";
    case "comment":
      return "Nouveau commentaire";
    case "remix":
      return "Nouveau remix";
    case "video-ready":
      return "Vidéo prête !";
    case "system":
      return "AIflex";
    default:
      return "AIflex";
  }
}
