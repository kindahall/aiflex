import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  addComment,
  getCommentById,
  getProjectById,
  listCommentsForProject,
  listReplies,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";
import { moderateContentSafe } from "@/lib/moderation";
import { commentLimiter, checkPerUser, RateLimitError } from "@/lib/rate-limit";
import { extractMentions } from "@/lib/comment-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 600;
const MIN_BODY = 1;

/**
 * Comments thread for a public film. Reads are open, writes require an
 * authenticated user. Each new comment is screened by the text-mode
 * moderation layer (Claude Haiku) before being persisted; failures fail
 * open in dev so the flow keeps working without ANTHROPIC_API_KEY.
 */

async function loadPublic(id: string) {
  const project = await getProjectById(id);
  if (!project || !project.published || project.visibility !== "public") {
    throw new AuthError("Film introuvable", 404);
  }
  return project;
}

const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadPublic(id);

    const url = new URL(req.url);
    const parentId = url.searchParams.get("parentId");
    const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_COMMENT_LIMIT);
    const rawOffset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(
      MAX_COMMENT_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_COMMENT_LIMIT)
    );
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

    if (parentId) {
      // Return replies to a specific comment (bounded — threads can go wide).
      const replies = await listReplies(parentId);
      const total = replies.length;
      const page = replies.slice(offset, offset + limit);
      return NextResponse.json({
        comments: page,
        pagination: { total, limit, offset, nextOffset: offset + page.length },
      });
    }

    const comments = await listCommentsForProject(id);
    const total = comments.length;
    const page = comments.slice(offset, offset + limit);
    return NextResponse.json({
      comments: page,
      pagination: { total, limit, offset, nextOffset: offset + page.length },
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PostBody {
  body: string;
  parentId?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const _project = await loadPublic(id);

    // V8 §19.8 — per-user 20/h cap (the IP-level cap stays in middleware).
    try {
      await checkPerUser(commentLimiter, 20, user.id, "comment-user");
    } catch (rl) {
      if (rl instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Trop de commentaires en peu de temps. Réessaie dans une heure." },
          { status: 429 }
        );
      }
      throw rl;
    }

    const payload = (await req.json()) as PostBody;
    const body = (payload.body || "").trim();

    if (body.length < MIN_BODY) {
      return NextResponse.json({ error: "Le commentaire ne peut pas être vide." }, { status: 400 });
    }
    if (body.length > MAX_BODY) {
      return NextResponse.json({ error: `Maximum ${MAX_BODY} caractères.` }, { status: 400 });
    }

    // Text moderation. Bypassed in dev (no ANTHROPIC_API_KEY) — we still
    // want to *log* bypasses so they're auditable.
    const mod = await moderateContentSafe(body, "user-text");
    if (!mod.allowed) {
      return NextResponse.json(
        {
          error: `Commentaire refusé par la modération (${mod.category || "other"}) : ${mod.reason || "contenu non autorisé"}`,
          moderation: {
            allowed: false,
            category: mod.category,
            reason: mod.reason,
          },
        },
        { status: 422 }
      );
    }

    // Validate parentId if provided.
    const parentId = payload.parentId || undefined;
    if (parentId) {
      const parent = await getCommentById(parentId);
      if (!parent || parent.projectId !== id) {
        return NextResponse.json({ error: "Commentaire parent introuvable." }, { status: 404 });
      }
    }

    const comment = await addComment({
      projectId: id,
      authorId: user.id,
      authorName: user.name,
      body,
      parentId,
    });

    // Notify film owner.
    notify({
      userId: _project.ownerId,
      kind: "comment",
      message: `${user.name} a commenté « ${_project.concept?.title || "ton film"} »`,
      href: `/watch/${id}`,
      actorId: user.id,
      actorName: user.name,
      projectId: id,
    }).catch((e) => console.error("[notification] failed:", e));

    // V8 §24.1 — mention notifications. Extract @username from the body
    // and resolve via case-insensitive name match. Best-effort and capped
    // by extractMentions (5 max) to keep load bounded.
    const mentions = extractMentions(body);
    if (mentions.length > 0) {
      try {
        const { findUsersByNames } = await import("@/lib/server-db");
        const lowerNameToUser = await findUsersByNames(mentions);
        for (const name of mentions) {
          const target = lowerNameToUser.get(name);
          if (!target || target.id === user.id || target.id === _project.ownerId) {
            continue; // skip self & double-notify of project owner
          }
          notify({
            userId: target.id,
            kind: "comment",
            message: `${user.name} t'a mentionné dans un commentaire`,
            href: `/watch/${id}`,
            actorId: user.id,
            actorName: user.name,
            projectId: id,
          }).catch(() => {});
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[mentions] notification fan-out failed:", e);
      }
    }

    return NextResponse.json({ comment });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
