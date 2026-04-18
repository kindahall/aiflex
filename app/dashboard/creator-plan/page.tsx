import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCreatorProStatus } from "@/lib/creator-pro";
import { CREATOR_PRO_PLANS } from "@/lib/types/film";
import CreatorPlanSubscribeButton from "@/components/CreatorPlanSubscribeButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Pro — AIflex",
  description:
    "Abonne-toi à Creator Pro pour un quota mensuel de générations incluses et un prix par vidéo ultra réduit.",
};

export default async function CreatorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/dashboard/creator-plan");

  const current = await getCreatorProStatus(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Creator Pro
        </div>
        <h1 className="font-display text-4xl font-bold">Quota de génération inclus</h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Avec Creator Pro, un certain nombre de générations sont incluses
          chaque mois — le coût par film descend sous la barre des $20 et le
          quota se recharge automatiquement.
        </p>
      </header>

      {status === "success" && (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-400">
          ✅ Souscription enregistrée. Ton quota est disponible dès maintenant.
        </div>
      )}
      {status === "cancel" && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-400">
          Paiement annulé. Aucun frais n&apos;a été prélevé.
        </div>
      )}

      {current ? (
        <section className="mb-10 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-cinema sm:p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">
              Plan actif : {current.label}
            </h2>
            <span className="text-sm text-flex-muted">
              ${(current.priceCents / 100).toFixed(2)}/mois
            </span>
          </div>
          <p className="mt-2 text-xs text-flex-muted">
            Prochaine remise à zéro :{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "short",
            }).format(new Date(current.resetAt))}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {Object.entries(current.monthlyQuota).map(([format, allowed]) => {
              const used = current.usedThisMonth[format] ?? 0;
              const remaining = Math.max(0, (allowed as number) - used);
              const pct = (used / (allowed as number)) * 100;
              return (
                <li key={format} className="rounded-xl bg-flex-card p-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="font-medium">{formatLabel(format)}</span>
                    <span className="text-xs text-flex-muted">
                      {used} / {allowed} utilisés · {remaining} restants
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-flex-border">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {Object.entries(CREATOR_PRO_PLANS).map(([id, cfg]) => {
          const isCurrent = current?.plan === id;
          return (
            <div
              key={id}
              className={`rounded-3xl border p-6 shadow-cinema ${
                isCurrent
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-flex-border bg-flex-panel"
              }`}
            >
              <h3 className="font-display text-lg font-semibold">{cfg.label}</h3>
              <div className="mt-2 font-display text-3xl font-bold text-flex-accent">
                ${(cfg.priceCents / 100).toFixed(0)}
                <span className="text-base font-normal text-flex-muted">/mois</span>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-flex-muted">
                {Object.entries(cfg.monthlyQuota).map(([format, count]) => (
                  <li key={format}>
                    • {count} × {formatLabel(format)}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <div className="rounded-full bg-emerald-500/15 px-4 py-2 text-center text-sm font-medium text-emerald-400">
                    ✓ Plan actuel
                  </div>
                ) : (
                  <CreatorPlanSubscribeButton plan={id} />
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function formatLabel(format: string): string {
  const map: Record<string, string> = {
    episode_5: "épisode 5 min",
    episode_15: "épisode 15 min",
    short_30: "court-métrage 30 min",
    film_90: "film 1h30",
    short_vertical: "short vertical",
  };
  return map[format] ?? format;
}
