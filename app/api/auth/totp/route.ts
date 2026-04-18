import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/server-db";
import { generateSecret, generateBackupCodes, buildOtpAuthUri } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — get 2FA status. */
export async function GET() {
  try {
    const user = await requireUser();
    const record = await findUserById(user.id);
    return NextResponse.json({
      enabled: record?.totpEnabled ?? false,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — begin 2FA setup (generate secret + QR URI). */
export async function POST() {
  try {
    const user = await requireUser();
    const record = await findUserById(user.id);

    if (record?.totpEnabled) {
      return NextResponse.json(
        { error: "2FA déjà activé. Désactive-le d'abord." },
        { status: 400 }
      );
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const otpAuthUri = buildOtpAuthUri(secret, user.email);

    // Save secret (not yet enabled — user must verify first)
    await updateUser(user.id, {
      totpSecret: secret,
      totpBackupCodes: backupCodes,
      totpEnabled: false,
    });

    return NextResponse.json({
      secret,
      otpAuthUri,
      backupCodes,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE — disable 2FA. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { code: string };

    if (!body.code) {
      return NextResponse.json(
        { error: "Code TOTP requis pour désactiver" },
        { status: 400 }
      );
    }

    const record = await findUserById(user.id);
    if (!record?.totpEnabled) {
      return NextResponse.json({ error: "2FA non activé" }, { status: 400 });
    }

    // Verify the code before disabling
    const { verifyTOTP } = await import("@/lib/totp");
    const valid = await verifyTOTP(record.totpSecret!, body.code);

    // Also check backup codes
    const isBackup = !valid && record.totpBackupCodes?.includes(body.code);

    if (!valid && !isBackup) {
      return NextResponse.json({ error: "Code invalide" }, { status: 403 });
    }

    await updateUser(user.id, {
      totpSecret: undefined,
      totpEnabled: false,
      totpBackupCodes: [],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
