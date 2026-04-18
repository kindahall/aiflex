import { NextResponse } from "next/server";
import { createUser, findUserByEmail, getSettings, toPublicUser } from "@/lib/server-db";
import { hashPassword } from "@/lib/password";
import { startSession } from "@/lib/auth";
import { signToken } from "@/lib/tokens";
import { publicUrl, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email: string;
  password: string;
  name: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const name = body.name?.trim() || email?.split("@")[0] || "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Email invalide" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit faire au moins 6 caractères" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "Nom invalide" },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    if (!settings.allowSignups) {
      return NextResponse.json(
        { error: "Les inscriptions sont temporairement fermées." },
        { status: 403 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }

    const user = await createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      avatarSeed: email,
    });
    await startSession(user.id);

    // Fire-and-forget verification email. Failures must NOT block signup
    // (the user can always resend from the dashboard) — they're logged
    // for monitoring instead.
    (async () => {
      try {
        const token = signToken(user.id, "email-verification", 60 * 60 * 24);
        const url = publicUrl(`/verify-email?token=${token}`);
        await sendEmail({
          to: user.email,
          subject: "Bienvenue sur AIflex — vérifie ton adresse",
          text: `Bonjour ${user.name},

Bienvenue sur AIflex ! Une dernière étape avant de pouvoir publier tes films : confirme ton adresse email en cliquant sur ce lien.

${url}

Le lien est valide 24 heures. Si tu n'as pas créé ce compte, ignore ce message.

L'équipe AIflex`,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[signup] verification email failed:", err);
      }
    })();

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
