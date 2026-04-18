import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  → list the current user's notifications (latest 50), with unread count.
 * POST → mark all notifications as read ("mark all read" button in UI).
 */

export async function GET() {
  try {
    const user = await requireUser();
    const [items, unread] = await Promise.all([
      listNotifications(user.id),
      countUnreadNotifications(user.id),
    ]);
    return NextResponse.json({ notifications: items, unread });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    await markAllNotificationsRead(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
