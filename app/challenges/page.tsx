import Link from "next/link";
import { listActiveChallenges } from "@/lib/challenges";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata = {
  title: "Challenges — AIflex",
  description:
    "Chaque mois un thème, un prize pool et la communauté vote le vainqueur. Montre ton univers.",
};

export default async function ChallengesPage() {
  const challenges = await listActiveChallenges().catch(() => []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-10 animate-fadeUp">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Communauté
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Challenges</h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Chaque mois un thème, un prize pool et la communauté vote le
          vainqueur. Soumets ton film public, récolte des votes, gagne du cash
          et un boost homepage 30 jours.
        </p>
      </header>

      {challenges.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-flex-border bg-flex-card p-12 text-center">
          <div className="text-4xl">🏆</div>
          <h2 className="mt-4 font-display text-xl font-semibold">
            Pas de challenge en cours
          </h2>
          <p className="mt-2 text-sm text-flex-muted">
            Le prochain challenge arrive bientôt. Abonne-toi aux notifications
            pour être prévenu.
          </p>
        </section>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
          {challenges.map((c) => (
            <Link
              key={c.id}
              href={`/challenges/${c.id}`}
              className="group overflow-hidden rounded-3xl border border-flex-border bg-flex-panel shadow-cinema transition hover:border-flex-accent/50"
            >
              <div className="relative aspect-[16/7] bg-gradient-to-br from-flex-accent/30 via-flex-accent2/20 to-flex-gold/30">
                <div className="absolute inset-0 flex flex-col justify-between p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white/90">
                      {c.theme}
                    </span>
                    <span className="rounded-full bg-flex-gold/90 px-2 py-0.5 text-xs font-medium text-black">
                      💰 ${(c.prizePoolCents / 100).toFixed(0)} pool
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white drop-shadow">
                    {c.title}
                  </h2>
                </div>
              </div>
              <div className="p-5">
                <p className="line-clamp-2 text-sm text-flex-muted">{c.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-flex-muted">
                  <span>{c._count.entries} participation{c._count.entries > 1 ? "s" : ""}</span>
                  <span>
                    Fin le{" "}
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                    }).format(c.endAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
