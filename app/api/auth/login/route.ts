import { NextResponse } from "next/server";
import { findUserByEmail, toPublicUser } from "@/lib/server-db";
import { dummyVerifyPassword, verifyPassword } from "@/lib/password";
import { startSession } from "@/lib/auth";
import { getTrustedClientIp } from "@/lib/client-ip";
import { signToken, verifyToken } from "@/lib/tokens";
import {
  isTotpLocked,
  isTotpLockedByIp,
  recordFailedTotp,
  recordFailedTotpByIp,
  resetTotpFailures,
  resetTotpFailuresByIp,
} from "@/lib/totp-lockout";
import { isLocked, recordFailure, resetFailures } from "@/lib/auth-lockout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email: string;
  password: string;
  /** Short-lived HMAC-signed challenge returned on step 1 when 2FA required. */
  challenge?: string;
  totpCode?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    // Per-account lockout — kicks in after repeated failures on a given
    // email regardless of source IP. Defeats credential-stuffing botnets.
    const remainingLock = isLocked("login", email);
    if (remainingLock > 0) {
      return NextResponse.json(
        {
          error: `Trop de tentatives. Réessaie dans ${Math.ceil(remainingLock / 60_000)} min.`,
        },
        { status: 429 }
      );
    }

    const user = await findUserByEmail(email);

    // Run scrypt unconditionally so the response time is independent of
    // whether the email exists — kills the user-enumeration timing
    // channel.
    if (!user) {
      await dummyVerifyPassword(password);
      recordFailure("login", email);
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      recordFailure("login", email);
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }
    resetFailures("login", email);
    if (user.suspended) {
      return NextResponse.json(
        { error: "Ce compte est suspendu. Contacte le support." },
        { status: 403 }
      );
    }

    // --- 2FA path -----------------------------------------------------
    if (user.totpEnabled && user.totpSecret) {
      const totpCode = (body.totpCode ?? "").trim();

      if (!totpCode) {
        // Step 1: emit a short-lived HMAC-signed challenge instead of
        // echoing the internal userId back. The client returns the
        // challenge in step 2; we never exchange identifiers with an
        // unauthenticated client.
        const challenge = signToken(user.id, "2fa-challenge", 5 * 60);
        return NextResponse.json({ requires2FA: true, challenge });
      }

      // Step 2: the challenge must match THIS user.
      const challenge = body.challenge || "";
      const verified = verifyToken(challenge, "2fa-challenge");
      if (!verified.valid || verified.payload.sub !== user.id) {
        return NextResponse.json({ error: "Challenge 2FA invalide" }, { status: 401 });
      }

      const reqLike = { headers: { get: (n: string) => req.headers.get(n) } };
      const clientIp = getTrustedClientIp(reqLike);
      const remainingUser = isTotpLocked(user.id);
      const remainingIp = isTotpLockedByIp(clientIp);
      const remaining = Math.max(remainingUser, remainingIp);
      if (remaining > 0) {
        return NextResponse.json(
          {
            error: `Trop de tentatives. Réessaie dans ${Math.ceil(remaining / 60000)} min.`,
          },
          { status: 429 }
        );
      }

      const { verifyTOTP, verifyBackupCode } = await import("@/lib/totp");
      const valid = await verifyTOTP(user.totpSecret, totpCode);

      // Backup-code check: supports hashed (new) and plaintext (legacy)
      // stored entries via verifyBackupCode.
      let matchedBackup: string | null = null;
      if (!valid && user.totpBackupCodes?.length) {
        matchedBackup = user.totpBackupCodes.find((bc) => verifyBackupCode(bc, totpCode)) ?? null;
      }
      const isBackup = Boolean(matchedBackup);

      if (!valid && !isBackup) {
        recordFailedTotp(user.id);
        recordFailedTotpByIp(clientIp);
        return NextResponse.json({ error: "Code 2FA invalide" }, { status: 401 });
      }

      if (isBackup && matchedBackup) {
        const { updateUser } = await import("@/lib/server-db");
        await updateUser(user.id, {
          totpBackupCodes: (user.totpBackupCodes ?? []).filter((c) => c !== matchedBackup),
        });
      }

      resetTotpFailures(user.id);
      resetTotpFailuresByIp(clientIp);
    }

    await startSession(user.id);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
