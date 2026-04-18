import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FeatureFlagsForm from "@/components/admin/FeatureFlagsForm";

export const dynamic = "force-dynamic";

const FLAG_DESCRIPTIONS: Record<string, string> = {
  sequelsEnabled:
    "Permet aux abonnés de générer des suites des films publics. Le différenciateur cœur d'AIflex.",
  adsEnabled:
    "Active la diffusion publicitaire (pre-roll, mid-roll, banner). Coupe les pubs pour les abonnés Premium quoi qu'il arrive.",
  shortsEnabled:
    "Affiche le feed vertical /shorts dans la navbar. À activer une fois que le format short_vertical compte assez d'inventaire.",
  dubbingEnabled:
    "Permet aux créateurs de demander un doublage automatique via ElevenLabs. Désactive si la facture grimpe trop vite.",
  recommendationsEnabled:
    "Active l'API de recommandations personnalisées (pgvector). Désactive en cas d'absence de pgvector ou d'embeddings.",
};

export default async function FeatureFlagsPage() {
  const user = await requireUser().catch(() => null);
  if (!user || user.role !== "admin") {
    redirect("/login?redirect=/admin/feature-flags");
  }

  const settings = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      sequelsEnabled: true,
      adsEnabled: true,
      shortsEnabled: true,
      dubbingEnabled: true,
      recommendationsEnabled: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Admin
      </Link>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Feature flags</h1>
        <p className="mt-2 text-sm text-flex-muted">
          Active ou désactive en live des fonctionnalités sans redéploiement.
          Les changements sont propagés aux serveurs sous 30 s (cache TTL).
        </p>
      </header>

      <FeatureFlagsForm
        initial={
          (settings ?? {
            sequelsEnabled: true,
            adsEnabled: false,
            shortsEnabled: false,
            dubbingEnabled: false,
            recommendationsEnabled: false,
          }) as Record<string, boolean>
        }
        descriptions={FLAG_DESCRIPTIONS}
      />
    </div>
  );
}
