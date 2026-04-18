import Link from "next/link";
import Image from "next/image";
import { listPublicCharacters } from "@/lib/character-marketplace";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata = {
  title: "Personnages — AIflex",
  description:
    "Marketplace de personnages AIflex. Réutilise les personnages publics d'autres créateurs avec une part royalty.",
};

export default async function CharactersMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const characters = await listPublicCharacters({ search: q, limit: 100 }).catch(
    () => []
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 animate-fadeUp">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Marketplace
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          Personnages publics
        </h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Une banque de personnages publiés par les créateurs AIflex. Tu peux
          en réutiliser un dans ton prochain film en échange d&apos;une royalty
          sur tes vues qualifiées.
        </p>
      </header>

      <form className="mb-8" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Chercher un personnage…"
          className="w-full rounded-full border border-flex-border bg-flex-surface px-4 py-2.5 text-sm focus:border-flex-accent focus:outline-none"
        />
      </form>

      {characters.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-flex-border p-12 text-center text-sm text-flex-muted">
          Aucun personnage public trouvé. Les créateurs peuvent en publier
          depuis leur dashboard.
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <li
              key={c.id}
              className="overflow-hidden rounded-3xl border border-flex-border bg-flex-panel transition hover:border-flex-accent/50"
            >
              <div className="relative aspect-[2/3] bg-flex-card">
                {c.referenceImageUrl ? (
                  <Image
                    src={c.referenceImageUrl}
                    alt={c.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-flex-muted">
                    Pas d&apos;image
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{c.name}</h2>
                  <span className="rounded-full bg-flex-gold/20 px-2 py-0.5 text-xs font-medium text-flex-gold">
                    {c.licensePercent ?? 5}%
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-flex-muted">
                  {c.description}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-flex-muted">
                  <span>par {c.creator.name}</span>
                  <span>{c._count.licenses} licence{c._count.licenses > 1 ? "s" : ""}</span>
                </div>
                <Link
                  href={`/characters/${c.id}`}
                  className="mt-4 block rounded-full border border-flex-border px-3 py-2 text-center text-xs font-medium hover:bg-flex-card"
                >
                  Voir détails
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
