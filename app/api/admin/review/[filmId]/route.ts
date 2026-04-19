import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { getTrustedClientIp } from "@/lib/client-ip";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { logAdminAction } from "@/lib/audit";
import { swallowAndReport } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReviewBody {
  decision: "approve" | "reject";
  note?: string;
}

/**
 * Admin review of a public user-upload (V7 §7).
 * Approve  → status "ready", visible in catalogue
 * Reject   → status "rejected" + credit issued to user.credits (refund as store credit)
 */
export async function POST(req: Request, { params }: { params: Promise<{ filmId: string }> }) {
  try {
    const user = await requireAdmin();

    const { filmId } = await params;
    const body = (await req.json()) as ReviewBody;

    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
    }

    const film = await prisma.project.findUnique({
      where: { id: filmId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        uploadType: true,
        adminReviewStatus: true,
        amountPaid: true,
        creditIssued: true,
        visibility: true,
      },
    });
    if (!film) {
      return NextResponse.json({ error: "Film introuvable" }, { status: 404 });
    }
    if (film.uploadType !== "user_upload" || film.visibility !== "public") {
      return NextResponse.json(
        { error: "Ce contenu n'est pas soumis à modération." },
        { status: 400 }
      );
    }
    if (film.adminReviewStatus === "approved" || film.adminReviewStatus === "rejected") {
      return NextResponse.json(
        { error: `Déjà décidé (${film.adminReviewStatus})` },
        { status: 400 }
      );
    }

    const trustedIp = getTrustedClientIp(req);
    const ip = trustedIp !== "anonymous" ? trustedIp : undefined;

    if (body.decision === "approve") {
      await prisma.project.update({
        where: { id: filmId },
        data: {
          adminReviewStatus: "approved",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          adminReviewNote: body.note ?? null,
          status: "ready",
          published: true,
          publishedAt: new Date(),
        },
      });
      logAdminAction({
        adminId: user.id,
        action: "approve_film",
        targetId: filmId,
        targetType: "film",
        metadata: { note: body.note },
        ipAddress: ip,
      }).catch(swallowAndReport("admin/review/[filmId]/log"));
      notify({
        userId: film.ownerId,
        kind: "video-ready",
        message: `✅ Ton film "${film.title ?? ""}" est en ligne.`,
        href: `/watch/${filmId}`,
        projectId: filmId,
      }).catch(swallowAndReport("admin/review/[filmId]/log"));
      return NextResponse.json({ ok: true, decision: "approve" });
    }

    // Reject: credit user.credits in cents, mark rejected
    const creditAmount = !film.creditIssued ? (film.amountPaid ?? 0) : 0;

    await prisma.$transaction([
      prisma.project.update({
        where: { id: filmId },
        data: {
          adminReviewStatus: "rejected",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          adminReviewNote: body.note ?? null,
          status: "rejected",
          creditIssued: creditAmount > 0 ? true : film.creditIssued,
          creditAmount: creditAmount > 0 ? creditAmount : (film.amountPaid ?? 0),
        },
      }),
      ...(creditAmount > 0
        ? [
            prisma.user.update({
              where: { id: film.ownerId },
              data: { credits: { increment: creditAmount } },
            }),
          ]
        : []),
    ]);

    logAdminAction({
      adminId: user.id,
      action: "reject_film",
      targetId: filmId,
      targetType: "film",
      metadata: { note: body.note, creditAmount },
      ipAddress: ip,
    }).catch(swallowAndReport("admin/review/[filmId]/log"));

    notify({
      userId: film.ownerId,
      kind: "system",
      message: `❌ Ton film "${film.title ?? ""}" a été refusé : ${body.note ?? "non conforme"}. Un avoir a été crédité sur ton compte.`,
      href: `/account`,
      projectId: filmId,
    }).catch(swallowAndReport("admin/review/[filmId]/log"));

    return NextResponse.json({ ok: true, decision: "reject", creditAmount });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
