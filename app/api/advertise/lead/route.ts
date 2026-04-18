import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportLimiter, checkPerScope, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  budgetCents?: number;
  formats?: string[];
  message?: string;
}

const ALLOWED_FORMATS = new Set(["preroll_15", "midroll_30", "banner"]);

/**
 * Public lead capture for advertisers (V8 §A4).
 *
 * No auth — anyone can submit. Rate-limited per IP via the existing
 * report limiter (5/h) since the abuse profile is similar (form spam).
 *
 * The lead lands as `AdLead { status: "new" }`. Sales follows up manually
 * via /admin/ad-leads (TODO: page in a future wave).
 */
export async function POST(req: Request) {
  // Rate limit per IP first (anti-spam)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  try {
    await checkPerScope(
      "advertise-lead",
      60 * 60 * 1000,
      5,
      ip
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Trop de demandes. Réessaie plus tard." },
        { status: 429 }
      );
    }
    throw err;
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body.companyName?.trim() || !body.contactName?.trim() || !body.email?.trim()) {
    return NextResponse.json(
      { error: "Société, nom et email requis." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const formats = (body.formats ?? []).filter((f) => ALLOWED_FORMATS.has(f));

  // Suppress reportLimiter import warning by referencing it once
  void reportLimiter;

  await prisma.adLead.create({
    data: {
      companyName: body.companyName.trim().slice(0, 200),
      contactName: body.contactName.trim().slice(0, 100),
      email: body.email.trim().toLowerCase().slice(0, 200),
      phone: body.phone?.trim().slice(0, 50) || null,
      budgetCents:
        typeof body.budgetCents === "number" && body.budgetCents > 0
          ? Math.floor(body.budgetCents)
          : null,
      formats,
      message: body.message?.trim().slice(0, 2000) || null,
      status: "new",
    },
  });

  return NextResponse.json({ ok: true });
}
