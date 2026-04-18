import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/server-db";
import { verifyTOTP } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — verify a TOTP code.
 *
 * Two use cases:
 * 1. During 2FA setup: verifies and activates 2FA (setup=true).
 * 2. During login: verifies the code for session validation.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { code: string; setup?: boolean };

    if (!body.code?.trim()) {
      return NextResponse.json({ error: "Code requis" }, { status: 400 });
    }

    const record = await findUserById(user.id);
    if (!record?.totpSecret) {
      return NextResponse.json(
        { error: "2FA non configuré" },
        { status: 400 }
      );
    }

    const code = body.code.trim().replace(/\s/g, "");
    const valid = await verifyTOTP(record.totpSecret, code);

    // Check backup codes if TOTP didn't match
    let usedBackup = false;
    if (!valid && record.totpBackupCodes?.includes(code)) {
      usedBackup = true;
      // Remove used backup code
      const remaining = record.totpBackupCodes.filter((c) => c !== code);
      await updateUser(user.id, { totpBackupCodes: remaining });
    }

    if (!valid && !usedBackup) {
      return NextResponse.json({ error: "Code invalide" }, { status: 403 });
    }

    // If this is the setup verification, enable 2FA
    if (body.setup && !record.totpEnabled) {
      await updateUser(user.id, { totpEnabled: true });
    }

    return NextResponse.json({
      valid: true,
      usedBackup,
      totpEnabled: body.setup ? true : record.totpEnabled,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
