import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getReferralStatus } from "@/lib/referral";
import ReferralShareCard from "@/components/ReferralShareCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parrainage — AIflex",
  description: "Partage ton lien AIflex et gagne 1 mois gratuit ou 5 % à vie par filleul.",
};

export default async function ReferralPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/dashboard/referral");

  const status = await getReferralStatus(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-10">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Parrainage
        </div>
        <h1 className="font-display text-4xl font-bold">Invite tes amis</h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Partage ton lien. Chaque filleul qui active un abonnement payant te
          rapporte <strong>1 mois gratuit</strong> OU <strong>5 % à vie</strong>{" "}
          sur ses paiements (seuil de versement $50).
        </p>
      </header>

      <ReferralShareCard shareUrl={status.shareUrl} code={status.code} />

      <section className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="Clics sur ton lien" value={String(status.signups)} />
        <Stat label="Conversions" value={String(status.conversions)} />
        <Stat
          label="Gains cumulés"
          value={`$${(status.earnedCents / 100).toFixed(2)}`}
          highlight
        />
      </section>

      <p className="mt-6 text-xs text-flex-muted">
        Les gains sont versés automatiquement via Stripe Connect à partir
        de $50 cumulés — configure ton compte Connect dans{" "}
        <Link href="/dashboard/payouts" className="text-flex-accent underline">
          /dashboard/payouts
        </Link>
        .
      </p>
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
      className={`rounded-2xl p-4 ring-1 ${
        highlight
          ? "bg-flex-accent/10 ring-flex-accent/30"
          : "bg-flex-panel ring-flex-border"
      }`}
    >
      <div className="text-xs text-flex-muted">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-bold ${
          highlight ? "text-flex-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
