import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DMCABody {
  claimantName: string;
  claimantEmail: string;
  targetProjectId: string;
  copyrightWork: string;
  goodFaithStmt: boolean;
  signature: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DMCABody;

    if (
      !body.claimantName?.trim() ||
      !body.claimantEmail?.trim() ||
      !body.targetProjectId?.trim() ||
      !body.copyrightWork?.trim() ||
      !body.goodFaithStmt ||
      !body.signature?.trim()
    ) {
      return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 });
    }

    // Persist the notice regardless of whether the target exists (we don't
    // want to reveal whether a given ID exists to the claimant for privacy).
    await prisma.dMCANotice.create({
      data: {
        claimantName: body.claimantName,
        claimantEmail: body.claimantEmail,
        targetProjectId: body.targetProjectId,
        copyrightWork: body.copyrightWork,
        goodFaithStmt: body.goodFaithStmt,
        signature: body.signature,
        status: "received",
      },
    });

    // Cross-file a Report so it shows up in the moderation queue
    const reporter = await getCurrentUser();
    if (reporter) {
      await prisma.report.create({
        data: {
          reporterId: reporter.id,
          reporterEmail: reporter.email,
          targetType: "project",
          targetId: body.targetProjectId,
          reason: "copyright",
          detail: `DMCA — ${body.claimantName}: ${body.copyrightWork.slice(0, 500)}`,
          status: "pending",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[legal/dmca]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
