import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  getConversationById,
  listMessages,
  sendMessage,
  markMessagesRead,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";
import { moderateAndLog } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list messages in a conversation. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await requireUser();
    const { conversationId } = await params;

    const conv = await getConversationById(conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    }

    // Mark messages as read
    await markMessagesRead(conversationId, user.id);

    const messages = await listMessages(conversationId);
    return NextResponse.json({ messages });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — send a message in a conversation. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await requireUser();
    const { conversationId } = await params;
    const body = (await req.json()) as { body: string };

    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Message vide" }, { status: 400 });
    }

    const conv = await getConversationById(conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    }

    // V8 §24.4 — block check : if any other participant has blocked the
    // sender, refuse the send. Cheap because the Block index covers it.
    const others = conv.participantIds.filter((id) => id !== user.id);
    if (others.length > 0) {
      const blockedBy = await prisma.block
        .findFirst({
          where: {
            blockedUserId: user.id,
            userId: { in: others },
          },
          select: { id: true },
        })
        .catch(() => null);
      if (blockedBy) {
        return NextResponse.json(
          { error: "Tu ne peux pas envoyer de message à cet utilisateur." },
          { status: 403 }
        );
      }
    }

    // V8 §24.4 — moderate the DM body before persisting. Same rules as
    // public comments (Claude Haiku); fail-open in dev when no key set.
    const mod = await moderateAndLog(prisma, {
      userId: user.id,
      content: body.body.trim(),
      kind: "dm",
    });
    if (!mod.allowed) {
      return NextResponse.json(
        {
          error: `Message refusé par la modération : ${mod.reason || "non conforme"}`,
        },
        { status: 400 }
      );
    }

    const message = await sendMessage({
      conversationId,
      senderId: user.id,
      body: body.body.trim(),
    });

    // Notify other participants
    const otherIds = conv.participantIds.filter((id) => id !== user.id);
    for (const recipientId of otherIds) {
      await notify({
        userId: recipientId,
        kind: "system",
        message: `${user.name} t'a envoyé un message`,
        href: `/messages?c=${conversationId}`,
        actorId: user.id,
        actorName: user.name,
      });
    }

    return NextResponse.json({ message });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
