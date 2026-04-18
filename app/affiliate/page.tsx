import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getReferralStatus } from "@/lib/referral";
import ReferralShareCard from "@/components/ReferralShareCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Programme d'affiliation — AIflex",
  description:
    "Gagne 5 % à vie sur tous les abonnements souscrits via ton lien. Versement automatique via Stripe Connect dès $50.",
};

/**
 * Public-facing affiliate landing (V8 §27.3).
 *
 * Re-uses the same `ReferralLink` model as the in-dashboard parrainage
 * (V8 §21.3). The differentiator vs /dashboard/referral is positioning :
 * /affiliate targets external influencers / content creators, with a
 * higher payout threshold ($50 vs $10) and a long-term commission story.
 */
export default async function AffiliatePage() {
  const user = await requireUser().catch(() => null);

  let myStatus: Awaited<ReturnType<typeof getReferralStatus>> | null = null;
  if (user) {
    myStatus = await getReferralStatus(user.id).catch(() => null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="mb-12 text-center animate-fadeUp">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Programme d&apos;affiliation
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          Gagne 5 % à vie sur chaque abonné amené
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-flex-muted">
          Pas un parrainage ponctuel : tant que ton filleul reste abonné, tu
          touches une commission tous les mois. Versement automatique via
          Stripe Connect dès $50 cumulés.
        </p>
      </header>

      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        <Card icon="🔗" title="Récupère ton lien">
          Génère un lien personnel en 5 secondes. Tracking cookie 30 jours sur
          chaque visite.
        </Card>
        <Card icon="📈" title="Suis tes conversions">
          Dashboard live : clics, signups, conversions payantes, gains
          cumulés.
        </Card>
        <Card icon="💸" title="Reçois tes paiements">
          Stripe Connect onboarding 5 min. Versement automatique le 1er du mois
          dès $50.
        </Card>
      </section>

      <section className="mb-12 rounded-3xl border border-flex-border bg-gradient-to-br from-flex-accent/10 via-flex-panel to-flex-accent2/10 p-8 sm:p-10">
        <h2 className="font-display text-2xl font-bold">Idéal si tu es :</h2>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <li>📹 Créateur de contenu vidéo (YouTube, Twitch, TikTok)</li>
          <li>📰 Newsletter culture / cinéma / IA</li>
          <li>🎨 Communauté Discord créative</li>
          <li>🎓 Coach / formateur en storytelling</li>
        </ul>
      </section>

      {!user ? (
        <section className="rounded-3xl border border-flex-border bg-flex-panel p-8 text-center shadow-cinema">
          <h2 className="font-display text-xl font-semibold">Crée un compte pour démarrer</h2>
          <p className="mt-2 text-sm text-flex-muted">
            Il te suffit d&apos;un compte AIflex gratuit pour récupérer ton lien.
          </p>
          <Link
            href="/login?redirect=/affiliate"
            className="mt-5 inline-block rounded-full bg-flex-accent px-6 py-3 text-sm font-medium text-white hover:brightness-110"
          >
            Créer mon compte
          </Link>
        </section>
      ) : myStatus ? (
        <section>
          <h2 className="mb-4 font-display text-2xl font-bold">Ton lien personnel</h2>
          <ReferralShareCard shareUrl={myStatus.shareUrl} code={myStatus.code} />
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Clics" value={String(myStatus.signups)} />
            <Stat label="Conversions payantes" value={String(myStatus.conversions)} />
            <Stat
              label="Gains cumulés"
              value={`$${(myStatus.earnedCents / 100).toFixed(2)}`}
              highlight
            />
          </div>
          <p className="mt-4 text-center text-xs text-flex-muted">
            Active Stripe Connect dans{" "}
            <Link href="/dashboard/payouts" className="text-flex-accent underline">
              /dashboard/payouts
            </Link>{" "}
            pour recevoir tes versements.
          </p>
        </section>
      ) : null}

      <footer className="mt-16 border-t border-flex-border pt-6 text-center text-xs text-flex-muted">
        Conditions complètes :{" "}
        <Link href="/legal/creator-terms" className="text-flex-accent underline">
          /legal/creator-terms
        </Link>
        . Le programme s&apos;applique aux abonnements (pas aux générations à la
        carte ni au PPV).
      </footer>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-flex-muted">{children}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 text-center ring-1 ${
        highlight
          ? "bg-flex-accent/10 ring-flex-accent/30"
          : "bg-flex-panel ring-flex-border"
      }`}
    >
      <div className="text-xs text-flex-muted">{label}</div>
      <div
        className={`mt-1 font-display text-xl font-bold ${
          highlight ? "text-flex-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
