import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SequelApprovalActions from "@/components/SequelApprovalActions";

export const dynamic = "force-dynamic";

/**
 * Pending sequel approvals (V8 §20.3).
 *
 * Lists every sequel job awaiting THIS user's approval as parent creator.
 * Approve → unblocks generation. Reject → credits the sequel-creator's avoir.
 * Ignored 72h → auto-approved by the cron (parent silence = consent).
 */
export default async function PendingSequelsPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/account/pending-sequels");

  // List the user's public films that have requireSequelApproval = true
  const myParentFilms = await prisma.project.findMany({
    where: {
      ownerId: user.id,
      requireSequelApproval: true,
      visibility: "public",
    },
    select: { id: true, title: true },
  });
  const parentIds = myParentFilms.map((p) => p.id);
  const parentTitleById = new Map(myParentFilms.map((p) => [p.id, p.title]));

  // Find awaiting jobs whose formData.parentFilmId is in our list
  const awaiting = await prisma.generationJob.findMany({
    where: { status: "awaiting_validation" },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  const filtered = awaiting.filter((j) => {
    const fd = (j.formData as Record<string, unknown>) || {};
    const pid = fd.parentFilmId as string | undefined;
    return pid && parentIds.includes(pid);
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Suites en attente d&apos;approbation</h1>
        <p className="mt-2 max-w-2xl text-sm text-flex-muted">
          Les autres créateurs ont demandé à générer des suites de tes films
          marqués <code>requireSequelApproval</code>. Tu as 72 h pour décider —
          au-delà la suite est approuvée automatiquement (silence vaut accord).
          Refuser crédite l&apos;avoir au demandeur.
        </p>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-flex-border bg-flex-panel p-12 text-center">
          <div className="mb-2 text-4xl">✨</div>
          <h2 className="font-display text-xl font-semibold">Tout est à jour</h2>
          <p className="mt-1 text-sm text-flex-muted">
            Aucune suite en attente. Active{" "}
            <code className="rounded bg-flex-card px-1.5 py-0.5">
              requireSequelApproval
            </code>{" "}
            sur un film pour passer en pré-modération.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((job) => {
            const fd = (job.formData as Record<string, unknown>) || {};
            const parentId = fd.parentFilmId as string;
            const deadline = fd.parentApprovalDeadline as string | undefined;
            const hoursLeft = deadline
              ? Math.max(
                  0,
                  Math.ceil((new Date(deadline).getTime() - Date.now()) / (60 * 60 * 1000))
                )
              : null;
            return (
              <li
                key={job.id}
                className="rounded-2xl border border-flex-border bg-flex-panel p-5 shadow-cinema"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-flex-muted">
                  <span>
                    Suite de{" "}
                    <Link href={`/watch/${parentId}`} className="text-flex-accent underline">
                      {parentTitleById.get(parentId) ?? parentId}
                    </Link>{" "}
                    par <strong>{job.user.name}</strong>
                  </span>
                  {hoursLeft != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        hoursLeft < 12
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-flex-card text-flex-muted"
                      }`}
                    >
                      ⏱ {hoursLeft}h restantes
                    </span>
                  )}
                </div>
                <p className="text-sm text-flex-text">
                  {job.userPrompt.slice(0, 400)}
                  {job.userPrompt.length > 400 ? "…" : ""}
                </p>
                <div className="mt-4">
                  <SequelApprovalActions jobId={job.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
