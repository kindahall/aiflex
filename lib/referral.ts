import "server-only";
import crypto from "node:crypto";
import { prisma } from "./prisma";

/**
 * Referral link helpers (V8 §21.3).
 *
 * Each user gets at most one `ReferralLink` with a 10-char code. Inbound
 * visitors hit `/?ref=<code>` and the middleware drops a 30-day cookie
 * `aiflex_ref=<code>` — on signup we look up the code and credit the
 * referrer with a signup count. On first paid conversion (first
 * Subscription going active), we bump `conversions` and add to `earnedCents`.
 *
 * The payout mechanism itself (1 free month OR 5% lifetime) is applied
 * by the subscription handler, not here — this lib is just tracking.
 */

export const REFERRAL_COOKIE = "aiflex_ref";
export const REFERRAL_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export async function getOrCreateReferralLink(userId: string) {
  const existing = await prisma.referralLink.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  // Generate a short, URL-safe code — try a few times to dodge collisions
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(8).toString("base64url").slice(0, 10);
    try {
      return await prisma.referralLink.create({
        data: { userId, code },
      });
    } catch {
      // unique collision → try again
    }
  }
  throw new Error("Impossible de générer un code de parrainage unique.");
}

/**
 * Increment `signups` on the ReferralLink matching `code`. Called on
 * successful signup, reading the cookie value. Silent no-op if code
 * doesn't exist — we don't want a typo'd referral to block signup.
 */
// Accept only URL-safe base64url chars, 1-20 length. Anything else is
// probably a path-injection or open-redirect attempt.
const CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

export function isValidReferralCode(code: string): boolean {
  return typeof code === "string" && CODE_RE.test(code);
}

export async function recordReferralSignup(code: string): Promise<string | null> {
  if (!isValidReferralCode(code)) return null;
  const link = await prisma.referralLink.findUnique({
    where: { code },
    select: { userId: true },
  });
  if (!link) return null;
  await prisma.referralLink.update({
    where: { code },
    data: { signups: { increment: 1 } },
  });
  return link.userId;
}

/**
 * Bump conversion counters when a referred user activates a paid plan.
 * Called from the Stripe webhook after successful subscription activation.
 */
export async function recordReferralConversion(
  referrerUserId: string,
  amountCents: number
): Promise<void> {
  await prisma.referralLink.updateMany({
    where: { userId: referrerUserId },
    data: {
      conversions: { increment: 1 },
      earnedCents: { increment: amountCents },
    },
  });
}

/**
 * Public-safe view of the referral status for the dashboard.
 */
export async function getReferralStatus(userId: string) {
  const link = await getOrCreateReferralLink(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://aiflex.app";
  return {
    code: link.code,
    shareUrl: `${appUrl}/?ref=${link.code}`,
    signups: link.signups,
    conversions: link.conversions,
    earnedCents: link.earnedCents,
  };
}
