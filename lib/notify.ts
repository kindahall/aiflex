import "server-only";
import { createNotification } from "./server-db";
import { sendPushToUser } from "./web-push";
import type { NotificationKind } from "./types";

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
    case "like": return "Nouveau like";
    case "comment": return "Nouveau commentaire";
    case "remix": return "Nouveau remix";
    case "video-ready": return "Vidéo prête !";
    case "system": return "AIflex";
    default: return "AIflex";
  }
}
