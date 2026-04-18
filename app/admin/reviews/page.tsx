import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const user = await requireUser().catch(() => null);
  if (!user || user.role !== "admin") {
    redirect("/login?redirect=/admin/reviews");
  }

  const pending = await prisma.project.findMany({
    where: {
      uploadType: "user_upload",
      visibility: "public",
      adminReviewStatus: "pending_review",
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      title: true,
      synopsis: true,
      genre: true,
      thumbnailUrl: true,
      coverUrl: true,
      createdAt: true,
      amountPaid: true,
      owner: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl font-bold">File de modération</h1>
          <span className="rounded-full bg-flex-accent/10 px-3 py-1 text-sm font-medium text-flex-accent">
            {pending.length} en attente
          </span>
        </div>
        <p className="mt-2 text-sm text-flex-muted">
          Films uploadés par des utilisateurs visant une publication publique. Les films
          IA et les uploads privés ne sont jamais soumis à review.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-3xl border border-flex-border bg-flex-panel p-12 text-center">
          <div className="mb-3 text-4xl">✨</div>
          <h2 className="font-display text-xl font-semibold">File vide</h2>
          <p className="mt-1 text-sm text-flex-muted">
            Aucun upload à examiner en ce moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map((p) => (
            <Link
              href={`/admin/reviews/${p.id}`}
              key={p.id}
              className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-panel transition hover:border-flex-accent/50 hover:shadow-cinema"
            >
              <div className="relative aspect-video bg-flex-card">
                {p.thumbnailUrl ? (
                  <Image
                    src={p.thumbnailUrl}
                    alt={p.title ?? ""}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-flex-muted">
                    Pas de thumbnail
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-1 font-medium group-hover:text-flex-accent">
                  {p.title || "Sans titre"}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-flex-muted">
                  {p.synopsis || "—"}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-flex-muted">
                  <span>{p.owner.name}</span>
                  <span>
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(p.createdAt)}
                  </span>
                </div>
                {p.amountPaid != null && (
                  <div className="mt-2 text-xs text-flex-muted">
                    Payé : ${(p.amountPaid / 100).toFixed(2)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
