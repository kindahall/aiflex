import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChallengeVoteButton from "@/components/ChallengeVoteButton";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const challenge = await prisma.challenge
    .findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { votes: "desc" },
          include: {
            project: {
              select: {
                id: true,
                title: true,
                thumbnailUrl: true,
                coverUrl: true,
                views: true,
                owner: { select: { id: true, name: true } },
              },
            },
          },
          take: 200,
        },
      },
    })
    .catch(() => null);

  if (!challenge) notFound();

  const isOpen = challenge.status === "open";
  const daysLeft = Math.max(
    0,
    Math.ceil((challenge.endAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/challenges"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Tous les challenges
      </Link>

      <header className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-flex-accent/30 via-flex-accent2/20 to-flex-gold/30 p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white/90">
            {challenge.theme}
          </span>
          <span className="rounded-full bg-flex-gold/90 px-2 py-0.5 text-xs font-medium text-black">
            💰 Prize pool ${(challenge.prizePoolCents / 100).toFixed(0)}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white">
            {isOpen ? `${daysLeft} j restants` : "Terminé"}
          </span>
        </div>
        <h1 className="mt-4 font-display text-4xl font-bold text-white drop-shadow">
          {challenge.title}
        </h1>
        <p className="mt-3 max-w-2xl text-white/80">{challenge.description}</p>
      </header>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">
            Participations ({challenge.entries.length})
          </h2>
          {isOpen && (
            <Link
              href="/studio"
              className="text-sm text-flex-accent hover:underline"
            >
              Soumettre un film →
            </Link>
          )}
        </div>

        {challenge.entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-flex-border p-10 text-center text-sm text-flex-muted">
            Sois le premier à soumettre une création sur ce thème.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {challenge.entries.map((entry, rank) => (
              <li
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-flex-border bg-flex-panel"
              >
                <Link
                  href={`/watch/${entry.project.id}`}
                  className="relative block aspect-video bg-flex-card"
                >
                  {entry.project.thumbnailUrl ? (
                    <Image
                      src={entry.project.thumbnailUrl}
                      alt={entry.project.title ?? ""}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-flex-muted">
                      —
                    </div>
                  )}
                  {rank === 0 && entry.votes > 0 && (
                    <div className="absolute left-3 top-3 rounded-full bg-flex-gold px-2 py-0.5 text-xs font-bold text-black">
                      🏆 En tête
                    </div>
                  )}
                </Link>
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="line-clamp-1 font-medium">
                      {entry.project.title ?? "Sans titre"}
                    </h3>
                    <span className="text-xs text-flex-muted">
                      {entry.votes} vote{entry.votes > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-flex-muted">
                    par {entry.project.owner.name}
                  </p>
                  {isOpen && (
                    <div className="mt-3">
                      <ChallengeVoteButton entryId={entry.id} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
