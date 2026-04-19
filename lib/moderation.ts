import "server-only";
import { createHash } from "node:crypto";
import { callModerationJSON } from "./ai-client";
import { log } from "./logger";

async function sha256Fingerprint(s: string): Promise<string> {
  return "sha256:" + createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/**
 * Lightweight content moderation for visual prompts before they hit the
 * (expensive, lightly-policed) text-to-video models. We use Claude Haiku
 * directly — never the configured narrative model, which might be Opus
 * and would make moderation 10× more expensive than the thing it's
 * protecting.
 *
 * Failure policy: in the absence of an API key OR on transport errors,
 * we **fail open** so dev environments and Anthropic outages don't lock
 * users out of the studio. Production deployments should pair this with
 * Sentry alerting on `[moderation] check failed` so an admin notices.
 * Switching to fail-closed is one boolean below.
 */

export type ModerationCategory =
  | "minors"
  | "real-person"
  | "violence"
  | "hate"
  | "sexual"
  | "copyright"
  | "other";

export interface ModerationResult {
  allowed: boolean;
  category?: ModerationCategory;
  reason?: string;
  /**
   * True when the check was bypassed (no key, transport error). Lets
   * callers log/alert without blocking the user.
   */
  bypassed?: boolean;
}

export type ModerationKind = "visual-prompt" | "user-text" | "upload-desc" | "dm";

/**
 * Whether a missing provider / transport error must block content.
 * Explicit `MODERATION_ENFORCE=1` wins over `NODE_ENV`, so previews or
 * mislabeled runtimes cannot silently fall back to fail-open.
 * `MODERATION_ENFORCE=0` is the documented opt-out for local dev/CI.
 */
function mustFailClosed(): boolean {
  const flag = process.env.MODERATION_ENFORCE;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Categories that trigger automatic admin escalation regardless of caller.
 * These content types are criminal in most jurisdictions — we log the event
 * with full context and suspend the user pending review.
 */
export const CRITICAL_CATEGORIES: readonly ModerationCategory[] = ["minors"] as const;

const VISUAL_SYSTEM = `Tu es un modérateur de contenu pour AIflex, plateforme de génération de films par IA.

Ton job : décider si un prompt visuel peut être envoyé à un modèle text-to-video, en respectant strictement les règles suivantes.

INTERDIT :
- Mineurs dans toute situation suggestive, sexualisée, violente ou inappropriée → catégorie "minors"
- Personnes réelles identifiables sans consentement (acteurs, politiques, célébrités) → catégorie "real-person"
- Violence graphique, gore, torture, mutilation → catégorie "violence"
- Haine, discrimination, propagande, symboles extrémistes → catégorie "hate"
- Contenu sexuel explicite, nudité explicite → catégorie "sexual"
- Copies directes de franchises protégées (Marvel, Disney, Star Wars, Harry Potter, Pokemon, Naruto, etc.) → catégorie "copyright"

AUTORISÉ :
- Fiction adulte stylisée
- Combats, action, suspense
- Horreur d'ambiance, tension, peur
- Romance non-explicite, sensualité suggérée
- Univers inspirés sans nommer ni copier de franchise

Tu réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans backticks :
- Si autorisé : {"allowed": true}
- Si refusé : {"allowed": false, "category": "minors|real-person|violence|hate|sexual|copyright|other", "reason": "courte phrase en français expliquant le refus"}`;

const TEXT_SYSTEM = `Tu es un modérateur de commentaires pour AIflex, plateforme communautaire de films générés par IA.

Ton job : décider si un commentaire utilisateur peut être publié sous un film, en respectant strictement les règles suivantes.

INTERDIT :
- Harcèlement, insultes ciblées, menaces → catégorie "hate"
- Discours de haine, racisme, sexisme, homophobie, transphobie → catégorie "hate"
- Doxing (partage d'infos personnelles), incitation à la violence → catégorie "hate"
- Contenu sexuel explicite, sollicitations → catégorie "sexual"
- Mention de mineurs dans un contexte sexuel ou inapproprié → catégorie "minors"
- Spam commercial, promotion d'arnaques, liens malveillants → catégorie "other"

AUTORISÉ :
- Critique constructive ou négative ("c'était nul", "j'ai pas aimé", "trop long")
- Avis subjectif honnête
- Questions au créateur
- Désaccord poli, débat
- Vocabulaire familier non-haineux

Sois TOLÉRANT sur les avis négatifs : la critique honnête fait partie d'une communauté saine. Ne refuse que ce qui vise à blesser ou nuire.

Tu réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans backticks :
- Si autorisé : {"allowed": true}
- Si refusé : {"allowed": false, "category": "minors|hate|sexual|other", "reason": "courte phrase en français expliquant le refus"}`;

/**
 * Run a moderation check on a single piece of content. The `kind` selects
 * the system prompt — visual prompts and free-form user text have very
 * different policies (the latter must allow honest negative reviews).
 *
 * Throws on transport errors — use `moderateContentSafe` for graceful
 * degradation in dev / on outage.
 */
function systemForKind(kind: ModerationKind): string {
  switch (kind) {
    case "visual-prompt":
      return VISUAL_SYSTEM;
    case "user-text":
    case "dm":
    case "upload-desc":
      return TEXT_SYSTEM;
  }
}

export async function moderateContent(
  content: string,
  kind: ModerationKind
): Promise<ModerationResult> {
  const system = systemForKind(kind);
  const text = await callModerationJSON(system, content);

  let clean = text;
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    clean = clean.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(clean) as ModerationResult;
    if (typeof parsed.allowed !== "boolean") {
      throw new Error("malformed: missing 'allowed' boolean");
    }
    return parsed;
  } catch (err) {
    log.warn("moderation.parse failed", {
      err: err instanceof Error ? err.message : String(err),
      sample: text.slice(0, 200),
    });
    // Malformed moderation responses must never greenlight content when
    // enforcement is on; `mustFailClosed` uses an explicit flag so preview
    // envs / mislabeled containers can't silently fall open.
    if (mustFailClosed()) {
      return {
        allowed: false,
        category: "other",
        reason: "Vérification de modération indisponible — réessaye plus tard",
      };
    }
    return { allowed: true, bypassed: true };
  }
}

/**
 * Same as `moderateContent` but never throws. If the API key is missing
 * (typical local dev) or Claude is unreachable, returns `{ allowed: true,
 * bypassed: true }` so the caller can keep going while still being able
 * to log the bypass for monitoring.
 */
export async function moderateContentSafe(
  content: string,
  kind: ModerationKind
): Promise<ModerationResult> {
  const failClosed = mustFailClosed();
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    if (failClosed) {
      log.error("moderation.noProvider configured — failing closed");
      return {
        allowed: false,
        category: "other",
        reason: "Service de modération indisponible",
      };
    }
    return { allowed: true, bypassed: true };
  }
  try {
    return await moderateContent(content, kind);
  } catch (err) {
    log.warn("moderation.check failed", {
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    if (failClosed) {
      return {
        allowed: false,
        category: "other",
        reason: "Service de modération temporairement indisponible",
      };
    }
    return { allowed: true, bypassed: true };
  }
}

// --- Backwards-compat wrappers for the visual-prompt callers ---------

export const moderatePrompt = (prompt: string) => moderateContent(prompt, "visual-prompt");

export const moderatePromptSafe = (prompt: string) => moderateContentSafe(prompt, "visual-prompt");

// ---------------------------------------------------------------------------
// Persistence + critical escalation (V8 §19.1, §19.9)
// ---------------------------------------------------------------------------

type PrismaModerationClient = {
  moderationLog: {
    create: (args: {
      data: {
        userId: string;
        contentType: string;
        content: string;
        decision: string;
        categories: string[];
        provider: string;
      };
    }) => Promise<unknown>;
  };
  user: {
    update: (args: { where: { id: string }; data: { suspended: boolean } }) => Promise<unknown>;
  };
};

/**
 * Run a moderation check AND persist the outcome to ModerationLog.
 * Critical categories (`minors`) auto-suspend the user and return a flagged
 * decision regardless of the raw check — this is a defense-in-depth against
 * false negatives on bordercase prompts.
 *
 * The Prisma client is injected so this module stays usable outside of the
 * Next.js runtime (scripts, tests).
 */
export async function moderateAndLog(
  prisma: PrismaModerationClient,
  params: {
    userId: string;
    content: string;
    kind: ModerationKind;
  }
): Promise<ModerationResult & { logged: boolean }> {
  const result = await moderateContentSafe(params.content, params.kind);

  const decision = result.bypassed ? "allowed" : result.allowed ? "allowed" : "blocked";

  const categories = result.category ? [result.category] : [];
  const critical = result.category ? CRITICAL_CATEGORIES.includes(result.category) : false;

  // RGPD art. 5 (minimisation). We keep the content snippet only when the
  // check actually flagged something — approved items store just a hash
  // fingerprint so we can still correlate repeat offenders without
  // retaining PII for two years.
  const keepFullContent = !result.allowed || critical;
  const storedContent = keepFullContent
    ? params.content.slice(0, 1000)
    : await sha256Fingerprint(params.content);

  let logged = false;
  try {
    await prisma.moderationLog.create({
      data: {
        userId: params.userId,
        contentType: params.kind,
        content: storedContent,
        decision: critical ? "flagged_for_review" : decision,
        categories,
        provider: "claude",
      },
    });
    logged = true;
  } catch (err) {
    log.warn("moderation.log writeFailed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (critical) {
    try {
      await prisma.user.update({
        where: { id: params.userId },
        data: { suspended: true },
      });
      log.error("moderation.criticalAutoSuspend", undefined, {
        userId: params.userId,
        category: result.category,
      });
    } catch (err) {
      log.warn("moderation.suspendFailed", {
        userId: params.userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return { allowed: false, category: result.category, reason: result.reason, logged };
  }

  return { ...result, logged };
}
