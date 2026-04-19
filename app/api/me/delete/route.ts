import { NextResponse } from "next/server";
import { AuthError, endSession, getCurrentUserRecord } from "@/lib/auth";
import { deleteUser, listProjectsByOwner } from "@/lib/server-db";
import { verifyPassword } from "@/lib/password";
import { isStripeConfigured, stripePost } from "@/lib/stripe";
import { getStorage, storagePaths } from "@/lib/storage";
import { verifyTOTP } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  currentPassword: string;
  confirmation: string;
  totpCode?: string;
}

const CONFIRMATION_WORD = "SUPPRIMER";

/**
 * Permanent self-service account deletion. Requires:
 *   1. The current password (to prove it's really the user).
 *   2. Typing the word "SUPPRIMER" verbatim (extra safety net).
 * Cascades via lib/server-db::deleteUser (sessions, projects, likes,
 * watchlist, comments, notifications, watch progress, follows are wiped).
 *
 * Admin accounts can't self-delete — use the admin panel to demote first.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentUserRecord();
    if (!me) throw new AuthError("Authentification requise", 401);

    if (me.role === "admin") {
      return NextResponse.json(
        {
          error: "Les comptes administrateurs ne peuvent pas être supprimés depuis le dashboard.",
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;
    if (body.confirmation !== CONFIRMATION_WORD) {
      return NextResponse.json(
        { error: `Tape "${CONFIRMATION_WORD}" pour confirmer.` },
        { status: 400 }
      );
    }
    if (!body.currentPassword) {
      return NextResponse.json({ error: "Mot de passe requis." }, { status: 400 });
    }

    const ok = await verifyPassword(me.passwordHash, body.currentPassword);
    if (!ok) {
      return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
    }

    // If 2FA is on, require a fresh TOTP code. Account deletion is the
    // highest-impact action a user can take — session-alone isn't enough.
    if (me.totpEnabled && me.totpSecret) {
      const code = (body.totpCode || "").trim();
      if (!code) {
        return NextResponse.json({ error: "Code 2FA requis", requires2FA: true }, { status: 401 });
      }
      const validTotp = await verifyTOTP(me.totpSecret, code);
      if (!validTotp) {
        return NextResponse.json({ error: "Code 2FA invalide" }, { status: 401 });
      }
    }

    // RGPD art. 17 (right to erasure) — the active Stripe subscription
    // MUST be cancelled before dropping the local user, otherwise billing
    // continues on an account we can no longer reconcile. We retry with
    // backoff; on definitive failure we block the deletion so the user
    // can retry instead of being silently billed.
    const hadSubscription = Boolean(me.stripeSubscriptionId);
    let stripeCancelled = false;
    if (hadSubscription && isStripeConfigured() && me.stripeSubscriptionId) {
      const subId = me.stripeSubscriptionId;
      const tryCancel = async (): Promise<boolean> => {
        try {
          await stripePost(`/subscriptions/${subId}`, {
            "cancellation_details[comment]": "account_deleted",
            cancel_at_period_end: "false",
          });
          return true;
        } catch {
          try {
            await stripePost(`/subscriptions/${subId}`, {
              cancel_at_period_end: "true",
            });
            return true;
          } catch {
            return false;
          }
        }
      };
      const backoffs = [0, 500, 1500];
      for (const wait of backoffs) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (await tryCancel()) {
          stripeCancelled = true;
          break;
        }
      }
      if (!stripeCancelled) {
        return NextResponse.json(
          {
            error:
              "Impossible d'annuler l'abonnement Stripe. Réessaie dans quelques minutes ou contacte le support — ton compte n'a pas été supprimé pour éviter une facturation orpheline.",
            hadSubscription,
            stripeCancelled,
          },
          { status: 503 }
        );
      }
    }

    // RGPD Art. 17 — best-effort storage purge of canonical keys tied to
    // the user's projects. We only touch keys we know we own (canonical
    // storagePaths); a nightly sweep job is still needed for non-canonical
    // leftovers. DB-level cascade drops the rows; storage needs explicit
    // deletes because S3/R2 don't follow DB cascades.
    try {
      const projects = await listProjectsByOwner(me.id);
      const storage = getStorage();
      const keys = new Set<string>();
      for (const p of projects) {
        keys.add(storagePaths.filmOutput(p.id));
        keys.add(storagePaths.filmThumbnail(p.id));
        keys.add(storagePaths.uploadedFilm(p.id));
        const scenes = p.scenes ?? [];
        for (let i = 0; i < scenes.length; i++) {
          keys.add(storagePaths.filmClip(p.id, String(i)));
        }
      }
      await Promise.allSettled(
        Array.from(keys).map((k) => storage.delete(k).catch(() => undefined))
      );
    } catch (err) {
      // Never block deletion on storage errors — the sweep job will catch
      // what we miss.
      // eslint-disable-next-line no-console
      console.warn("[me/delete] storage purge best-effort failed:", err);
    }

    await deleteUser(me.id);
    await endSession();

    return NextResponse.json({ ok: true, hadSubscription, stripeCancelled });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
