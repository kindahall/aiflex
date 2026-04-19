import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  listProjectsByOwner,
  listNotifications,
  listWatchlist,
  findUserById,
  toPublicUser,
} from "@/lib/server-db";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-service data export (RGPD — V8 §19.7).
 *
 * Produces a single downloadable JSON bundle containing everything we
 * hold about the user, excluding secrets (passwordHash, totpSecret,
 * parentalPin) and other users' data (comments by others, messages from
 * others, etc.).
 *
 * Entities included:
 *   - user record (redacted)
 *   - projects (their creations)
 *   - watchlist, notifications, likes, comments by them
 *   - view history (FilmView)
 *   - creator payouts + tips sent/received
 *   - push subscriptions (endpoints only, no keys)
 *   - consent history
 *   - moderation log entries (of their own content, last 180 days)
 *   - reports they filed
 *   - profiles (kids / adult profiles under their account)
 *   - sessions (active, for transparency — without tokens)
 *
 * Ceilings per entity are intentional to keep the response size sane.
 * Caller should hit this once; re-export is an admin workflow.
 */
export async function GET() {
  try {
    const me = await requireUser();
    const record = await findUserById(me.id);
    if (!record) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const safeUser = toPublicUser(record) as Record<string, unknown>;
    // Strip secrets even though toPublicUser keeps some of them.
    delete safeUser.passwordHash;
    delete safeUser.totpSecret;
    delete safeUser.totpBackupCodes;
    delete safeUser.parentalPin;

    const [
      projects,
      watchlist,
      notifications,
      likes,
      comments,
      views,
      payouts,
      tipsSent,
      tipsReceived,
      pushSubs,
      consents,
      moderation,
      reports,
      profiles,
      sessions,
      directMessages,
      conversations,
      accessLogs,
      aiCostEntries,
      adminActionsOnMe,
    ] = await Promise.all([
      listProjectsByOwner(me.id),
      listWatchlist(me.id),
      listNotifications(me.id),
      prisma.like.findMany({ where: { userId: me.id }, take: 5000 }),
      prisma.comment.findMany({ where: { authorId: me.id }, take: 5000 }),
      prisma.filmView.findMany({
        where: { userId: me.id },
        orderBy: { watchedAt: "desc" },
        take: 5000,
      }),
      prisma.creatorPayout.findMany({ where: { userId: me.id } }),
      prisma.tip.findMany({ where: { fromUserId: me.id }, take: 2000 }),
      prisma.tip.findMany({ where: { toUserId: me.id }, take: 2000 }),
      prisma.pushSubscription.findMany({
        where: { userId: me.id },
        select: { endpoint: true, createdAt: true }, // NOT the p256dh/auth keys
      }),
      prisma.consentRecord.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
      }),
      // RGPD Art. 15 — no retention cap on the user's own moderation history.
      prisma.moderationLog.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.report.findMany({ where: { reporterId: me.id } }),
      prisma.profile.findMany({ where: { userId: me.id } }),
      prisma.session.findMany({
        where: { userId: me.id },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          // token omitted on purpose
        },
      }),
      // RGPD art. 20 — DMs belong to the user's data too.
      prisma.directMessage.findMany({
        where: { senderId: me.id },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.conversation.findMany({
        where: { participants: { some: { userId: me.id } } },
        orderBy: { lastMessageAt: "desc" },
        take: 1000,
      }),
      // RGPD Art. 15 — who accessed what & when on this account.
      prisma.accessLog.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
      // AI usage ledger for this user — transparency on what was spent on their behalf.
      prisma.aiCostEntry.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
      // Admin actions targeting this user (ban, content removal, etc.).
      prisma.adminAuditLog.findMany({
        where: { targetType: "user", targetId: me.id },
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          // adminId / ipAddress / userAgent omitted — not the data subject's
          // personal data and can de-anonymize staff.
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      formatVersion: "3",
      note:
        "Cet export est généré au titre de l'article 20 RGPD (portabilité). " +
        "Les secrets (mots de passe, jetons 2FA, clés push) sont exclus.",
      user: safeUser,
      projects,
      watchlist,
      notifications,
      likes,
      comments,
      views,
      payouts,
      tips: { sent: tipsSent, received: tipsReceived },
      pushSubscriptions: pushSubs,
      consents,
      moderation,
      reports,
      profiles,
      sessions,
      directMessages,
      conversations,
      accessLogs,
      aiCostEntries,
      adminActionsOnMe,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="aiflex-data-${me.id}-${Date.now()}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    // eslint-disable-next-line no-console
    console.error("[me/export]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
