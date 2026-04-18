import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CollabSplitsForm from "@/components/CollabSplitsForm";

export const dynamic = "force-dynamic";

export default async function CollabSplitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/login?redirect=/dashboard/project/${projectId}/collab`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      collaborators: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      collaboratorSplits: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) {
    redirect(`/watch/${projectId}`);
  }

  const candidates = project.collaborators.map((c) => ({
    userId: c.user.id,
    name: c.user.name,
    email: c.user.email,
    role: c.role,
  }));

  const initialSplits = project.collaboratorSplits.map((s) => ({
    userId: s.userId,
    name: s.user.name,
    percent: s.percent,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Collaboration
        </div>
        <h1 className="font-display text-3xl font-bold">
          Partage des revenus — {project.title ?? "Sans titre"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-flex-muted">
          Définis quel pourcentage des revenus créateur revient à chaque
          collaborateur. Toi tu gardes automatiquement {Math.max(0, 100 - initialSplits.reduce((s, x) => s + x.percent, 0))}%
          (= 100% moins la somme attribuée). Les royalties suite et les frais
          AIflex sont prélevés au-dessus de ce calcul.
        </p>
      </header>

      <CollabSplitsForm
        projectId={project.id}
        candidates={candidates}
        initial={initialSplits}
      />
    </div>
  );
}
