import "server-only";
import crypto from "node:crypto";
import { prisma } from "./prisma";

/**
 * Parental controls (V8 §22.2).
 *
 * Three concrete enforcement layers on top of the Profile model:
 *   1. PIN gate when leaving a Kids profile to access an adult one
 *   2. Curfew hour — refuse playback past N o'clock on Kids profiles
 *   3. Weekly recap email to the parent account, summarising what each
 *      Kids profile watched in the previous 7 days
 *
 * PINs are hashed (PBKDF2) so a DB dump never reveals them in plaintext.
 * The hash format is `pbkdf2$<iterations>$<salt-base64>$<hash-base64>`.
 */

const PBKDF2_ITER = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

// ---------------------------------------------------------------------------
// PIN hashing & verification
// ---------------------------------------------------------------------------

export function hashPin(pin: string): string {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("Le PIN doit contenir entre 4 et 8 chiffres.");
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `pbkdf2$${PBKDF2_ITER}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iter = Number(iterStr);
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const got = crypto.pbkdf2Sync(pin, salt, iter, expected.length, PBKDF2_DIGEST);
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile-switch gate
// ---------------------------------------------------------------------------

/**
 * Decide whether moving from `currentProfileId` to `targetProfileId`
 * requires a PIN. Rule: leaving a Kids profile for a non-Kids profile
 * always requires the PIN of the target adult profile.
 *
 * Returns:
 *   { required: false }                — no challenge
 *   { required: true, profileId }      — PIN of `profileId` must be checked
 */
export async function shouldChallengePin(
  currentProfileId: string | null,
  targetProfileId: string
): Promise<{ required: false } | { required: true; profileId: string }> {
  if (!currentProfileId) return { required: false };
  const [current, target] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: currentProfileId },
      select: { isChild: true, userId: true },
    }),
    prisma.profile.findUnique({
      where: { id: targetProfileId },
      select: { isChild: true, parentalPin: true, userId: true },
    }),
  ]);
  if (!current || !target) return { required: false };
  if (current.userId !== target.userId) return { required: false };
  // Kids → non-Kids ? challenge if a PIN is set
  if (current.isChild && !target.isChild && target.parentalPin) {
    return { required: true, profileId: targetProfileId };
  }
  return { required: false };
}

// ---------------------------------------------------------------------------
// Curfew enforcement
// ---------------------------------------------------------------------------

function serverTzOffsetMinutes(): number {
  const raw = Number(process.env.PARENTAL_CURFEW_TZ_OFFSET_MINUTES);
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw) <= 14 * 60 ? raw : 0;
}

/**
 * True if the Kids profile is past its curfew hour at `now`. Returns
 * `false` when no curfew set or profile isn't a Kids profile.
 *
 * Curfew is a single integer (0-23). Child profiles ignore any client-
 * supplied `tzOffsetMinutes` (a minor could set UTC+14 from their browser
 * to defeat a UTC+2 curfew) — the offset comes from
 * `PARENTAL_CURFEW_TZ_OFFSET_MINUTES` on the server. Non-child calls
 * keep the best-effort browser offset for UX.
 */
export async function isPastCurfew(
  profileId: string,
  now: Date = new Date(),
  tzOffsetMinutes = 0
): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { isChild: true, curfewHour: true },
  });
  if (!profile?.isChild || profile.curfewHour == null) return false;

  const offset = serverTzOffsetMinutes();
  const browserOffset = Math.abs(tzOffsetMinutes) <= 14 * 60 ? tzOffsetMinutes : 0;
  const effective = profile.isChild ? offset : browserOffset;
  const local = new Date(now.getTime() + effective * 60_000);
  const hour = local.getUTCHours();
  const curfew = profile.curfewHour;
  if (curfew === 0) return false;
  return hour >= curfew || hour < 6;
}

// ---------------------------------------------------------------------------
// Weekly recap to the parent (cron)
// ---------------------------------------------------------------------------

export interface ParentRecapResult {
  parentsNotified: number;
  totalKidsProfiles: number;
}

/**
 * Compute and send the weekly Kids recap to every parent with at least
 * one Kids profile. Triggered every Monday by the cron runner.
 *
 * Recap content per Kids profile: total minutes, top 5 films watched
 * in the past 7 days. Only sent to parents that have given newsletter
 * consent (we treat the recap as marketing for opt-in purposes).
 */
export async function sendParentWeeklyRecap(): Promise<ParentRecapResult> {
  const { sendEmail } = await import("./email");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Find all Kids profiles
  const kids = await prisma.profile.findMany({
    where: { isChild: true },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (kids.length === 0) {
    return { parentsNotified: 0, totalKidsProfiles: 0 };
  }

  // 2. Group by parent userId
  type Recap = {
    parentEmail: string;
    parentName: string;
    profiles: Array<{
      profileName: string;
      profileId: string;
      sumPct: number;
      films: number;
    }>;
  };
  const byParent = new Map<string, Recap>();

  for (const k of kids) {
    const views = await prisma.filmView.findMany({
      where: { profileId: k.id, watchedAt: { gte: since } },
      select: { percentageWatched: true, projectId: true },
    });
    const summary = byParent.get(k.userId) ?? {
      parentEmail: k.user.email,
      parentName: k.user.name,
      profiles: [],
    };
    summary.profiles.push({
      profileName: k.name,
      profileId: k.id,
      sumPct: views.reduce((acc, v) => acc + v.percentageWatched, 0),
      films: views.length,
    });
    byParent.set(k.userId, summary);
  }

  // 3. Newsletter consent gate (re-use the same check as email-broadcast)
  const parentIds = [...byParent.keys()];
  const consents = await prisma.consentRecord.findMany({
    where: { userId: { in: parentIds }, type: "newsletter" },
    orderBy: { createdAt: "desc" },
  });
  const optedIn = new Map<string, boolean>();
  for (const c of consents) {
    if (!optedIn.has(c.userId)) optedIn.set(c.userId, c.accepted);
  }

  let sent = 0;
  for (const [parentId, recap] of byParent.entries()) {
    if (!optedIn.get(parentId)) continue;

    const lines = recap.profiles
      .map(
        (p) =>
          `  • ${p.profileName} : ${p.films} film${p.films > 1 ? "s" : ""} regardé${p.films > 1 ? "s" : ""}, complétion moyenne ${
            p.films > 0 ? Math.round(p.sumPct / p.films) : 0
          }%`
      )
      .join("\n");

    try {
      await sendEmail({
        to: recap.parentEmail,
        subject: `Récap weekly — temps d'écran de tes profils Kids`,
        text: `Salut ${recap.parentName},\n\nVoici ce que tes profils Kids ont regardé cette semaine :\n\n${lines}\n\nGérer les profils : https://aiflex.app/dashboard\n\n— L'équipe AIflex`,
      });
      sent++;
    } catch {
      /* never block */
    }
  }

  return { parentsNotified: sent, totalKidsProfiles: kids.length };
}
