import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateFeatureFlagsCache, type FeatureFlagKey } from "@/lib/feature-flags";
import { logAdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS: readonly FeatureFlagKey[] = [
  "sequelsEnabled",
  "adsEnabled",
  "shortsEnabled",
  "dubbingEnabled",
  "recommendationsEnabled",
];

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: Object.fromEntries(KEYS.map((k) => [k, true])) as Record<FeatureFlagKey, true>,
    });
    return NextResponse.json({ flags: settings ?? {} });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

interface PatchBody {
  flags: Partial<Record<FeatureFlagKey, boolean>>;
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    const body = (await req.json()) as PatchBody;
    if (!body.flags || typeof body.flags !== "object") {
      return NextResponse.json({ error: "flags manquants" }, { status: 400 });
    }

    const data: Partial<Record<FeatureFlagKey, boolean>> = {};
    for (const key of KEYS) {
      if (typeof body.flags[key] === "boolean") {
        data[key] = body.flags[key];
      }
    }

    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      // Required-on-create siteContent — keep an empty object as default
      create: { id: "singleton", siteContent: {} as object, ...data },
      update: data,
    });

    invalidateFeatureFlagsCache();

    logAdminAction({
      adminId: user.id,
      action: "update_settings",
      targetId: "singleton",
      targetType: "settings",
      metadata: { flags: data },
    }).catch(() => {});

    return NextResponse.json({ ok: true, flags: data });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
