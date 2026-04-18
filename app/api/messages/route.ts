import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  listConversations,
  findOrCreateConversation,
  countUnreadMessages,
  findUserById,
  isFollowing,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list conversations for the current user. */
export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await listConversations(user.id);
    const unread = await countUnreadMessages(user.id);

    // Enrich with participant names
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const otherIds = conv.participantIds.filter((id) => id !== user.id);
        const others = await Promise.all(
          otherIds.map(async (id) => {
            const u = await findUserById(id);
            return u ? { id: u.id, name: u.name, avatarSeed: u.avatarSeed } : null;
          })
        );
        return {
          ...conv,
          participants: others.filter(Boolean),
        };
      })
    );

    return NextResponse.json({ conversations: enriched, unread });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — start a new conversation (or return existing). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { recipientId: string };

    if (!body.recipientId) {
      return NextResponse.json(
        { error: "recipientId requis" },
        { status: 400 }
      );
    }

    if (body.recipientId === user.id) {
      return NextResponse.json(
        { error: "Impossible de s'envoyer un message à soi-même" },
        { status: 400 }
      );
    }

    const recipient = await findUserById(body.recipientId);
    if (!recipient) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    // Honor the recipient's DM privacy preference.
    const policy = recipient.preferences?.allowDMs ?? "everyone";
    if (policy === "nobody") {
      return NextResponse.json(
        { error: "Cet utilisateur n'accepte pas les messages." },
        { status: 403 }
      );
    }
    if (policy === "followers") {
      // Sender must already be a follower of the recipient.
      const follows = await isFollowing(user.id, body.recipientId);
      if (!follows) {
        return NextResponse.json(
          {
            error:
              "Cet utilisateur n'accepte les messages que de ses abonnés.",
          },
          { status: 403 }
        );
      }
    }

    const conversation = await findOrCreateConversation([
      user.id,
      body.recipientId,
    ]);

    return NextResponse.json({ conversation });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
