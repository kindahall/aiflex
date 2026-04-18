import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/observability";
import type { UserPlan } from "@/lib/types/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_COOKIE = "aiflex_profile_id";

interface ViewBody {
  projectId: string;
  percentageWatched: number;
  profileId?: string;
  /** Browser timezone offset in minutes (Date#getTimezoneOffset, may be negative). */
  tzOffsetMinutes?: number;
}

/**
 * Read the active profile cookie and validate ownership. Returns null if
 * unset or if the cookie references a profile that doesn't belong to the
 * authenticated user — prevents cross-account tampering.
 */
async function resolveActiveProfile(userId: string): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const id = cookieStore.get(PROFILE_COOKIE)?.value;
    if (!id) return null;
    const profile = await prisma.profile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!profile || profile.userId !== userId) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * Record a watch event. Called by the player when the user leaves a film
 * or when playback reaches 100%. The `percentageWatched` drives the
 * Spotify-style completion tier used by the monthly payout engine.
 *
 * Dedup: the same (user, project) on the same day only counts once — the
 * highest percentageWatched wins. This avoids rewarding tab refresh abuse.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ViewBody;

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId requis" }, { status: 400 });
    }
    const pct = Math.max(0, Math.min(100, Math.round(body.percentageWatched || 0)));
    const plan = (user.plan ?? "free") as UserPlan;

    // V8 §22.2 — Kids profile curfew enforcement. Reject view writes past
    // the configured curfew hour. The player should also stop playback
    // client-side; this is the server-side guardrail.
    const cookieProfileId = await resolveActiveProfile(user.id);
    const profileForCurfew = cookieProfileId ?? body.profileId ?? null;
    if (profileForCurfew) {
      const tzOffset =
        typeof (body as ViewBody).tzOffsetMinutes === "number"
          ? (body as ViewBody).tzOffsetMinutes!
          : 0;
      const { isPastCurfew } = await import("@/lib/parental");
      if (await isPastCurfew(profileForCurfew, new Date(), tzOffset)) {
        return NextResponse.json(
          {
            error: "Couvre-feu actif sur ce profil — relecture indisponible.",
          },
          { status: 403 }
        );
      }
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    // Dedup: upsert the highest pct for (user, project, day)
    const existing = await prisma.filmView.findFirst({
      where: {
        userId: user.id,
        projectId: body.projectId,
        watchedAt: { gte: startOfDay },
      },
      orderBy: { watchedAt: "desc" },
    });

    if (existing) {
      if (pct > existing.percentageWatched) {
        await prisma.filmView.update({
          where: { id: existing.id },
          data: { percentageWatched: pct },
        });
      }
    } else {
      // V8 §22.1 — prefer the cookie-attributed profile over the body param,
      // which could be spoofed by a malicious client.
      const activeProfileId =
        (await resolveActiveProfile(user.id)) ?? body.profileId ?? null;

      await prisma.filmView.create({
        data: {
          projectId: body.projectId,
          userId: user.id,
          profileId: activeProfileId,
          percentageWatched: pct,
          userPlan: plan,
        },
      });
      // Bump denormalized Project.views counter (cheap for catalogue sort)
      await prisma.project.update({
        where: { id: body.projectId },
        data: { views: { increment: 1 } },
      });
    }

    // Product funnel events (V8 §B7.1 observability funnels)
    const basePayload = { projectId: body.projectId, plan };
    if (pct >= 100) {
      trackEvent(user.id, "film_viewed_100pct", basePayload).catch(() => {});
    } else if (pct >= 70) {
      trackEvent(user.id, "film_viewed_70pct", basePayload).catch(() => {});
    } else {
      trackEvent(user.id, "film_viewed", { ...basePayload, pct }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
