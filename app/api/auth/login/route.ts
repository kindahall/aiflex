import { NextResponse } from "next/server";
import { findUserByEmail, toPublicUser } from "@/lib/server-db";
import { verifyPassword } from "@/lib/password";
import { startSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email: string;
  password: string;
  totpCode?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 }
      );
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 }
      );
    }
    if (user.suspended) {
      return NextResponse.json(
        { error: "Ce compte est suspendu. Contacte le support." },
        { status: 403 }
      );
    }

    // Check if 2FA is enabled
    if (user.totpEnabled && user.totpSecret) {
      const totpCode = body.totpCode ?? "";
      if (!totpCode) {
        // Signal that 2FA is required (don't create session yet)
        return NextResponse.json({
          requires2FA: true,
          userId: user.id,
        });
      }

      // Verify TOTP code
      const { verifyTOTP } = await import("@/lib/totp");
      const valid = await verifyTOTP(user.totpSecret, totpCode);
      const isBackup = !valid && user.totpBackupCodes?.includes(totpCode);

      if (!valid && !isBackup) {
        return NextResponse.json(
          { error: "Code 2FA invalide" },
          { status: 401 }
        );
      }

      // Remove used backup code
      if (isBackup) {
        const { updateUser } = await import("@/lib/server-db");
        await updateUser(user.id, {
          totpBackupCodes: user.totpBackupCodes!.filter((c) => c !== totpCode),
        });
      }
    }

    await startSession(user.id);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
