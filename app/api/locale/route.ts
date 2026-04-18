import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const VALID_LOCALES = new Set(["fr", "en", "es"]);

export async function POST(req: NextRequest) {
  try {
    const { locale } = (await req.json()) as { locale: string };

    if (!locale || !VALID_LOCALES.has(locale)) {
      return NextResponse.json(
        { error: "Locale invalide. Valeurs acceptées : fr, en, es" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.json({ ok: true, locale });
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
}
