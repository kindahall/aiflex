import Link from "next/link";
import AdvertiseLeadForm from "@/components/AdvertiseLeadForm";
import { AD_CPM_CENTS } from "@/lib/types/film";

export const dynamic = "force-static";

export const metadata = {
  title: "Annonceurs — AIflex",
  description:
    "Pré-roll, mid-roll, bannière catalogue : touche les spectateurs AIflex avec des campagnes ciblées par genre et pays.",
};

const FORMATS: Array<{
  key: keyof typeof AD_CPM_CENTS;
  label: string;
  desc: string;
  cpmCents: number;
}> = [
  {
    key: "preroll_15",
    label: "Pré-roll 15 sec",
    desc: "Spot avant la lecture du film. Skippable après 5 sec.",
    cpmCents: AD_CPM_CENTS.preroll_15,
  },
  {
    key: "midroll_30",
    label: "Mid-roll 30 sec",
    desc: "Coupure à mi-film. Le format le plus performant en CTR.",
    cpmCents: AD_CPM_CENTS.midroll_30,
  },
  {
    key: "banner",
    label: "Bannière catalogue",
    desc: "Tuile sponsorisée dans le catalogue. Ciblée par genre.",
    cpmCents: AD_CPM_CENTS.banner,
  },
];

export default function AdvertisePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-12 text-center animate-fadeUp">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Annonceurs
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          Touche une audience qui vient pour la création
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-flex-muted">
          Les spectateurs AIflex ne scrollent pas — ils choisissent un film. Tes
          campagnes apparaissent dans un contexte calme, après un acte
          d&apos;intention forte. Ciblage par genre et pays inclus.
        </p>
      </header>

      <section className="mb-16 grid gap-5 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <div
            key={f.key}
            className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema"
          >
            <h3 className="font-display text-xl font-semibold">{f.label}</h3>
            <p className="mt-2 text-sm text-flex-muted">{f.desc}</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold text-flex-accent">
                ${(f.cpmCents / 100).toFixed(0)}
              </span>
              <span className="text-sm text-flex-muted">CPM</span>
            </div>
          </div>
        ))}
      </section>

      <section className="mb-16 rounded-3xl border border-flex-border bg-gradient-to-br from-flex-accent/10 via-flex-panel to-flex-accent2/10 p-8 sm:p-10">
        <h2 className="font-display text-2xl font-bold">
          Pourquoi AIflex pour vos campagnes ?
        </h2>
        <ul className="mt-5 grid gap-3 text-sm text-flex-text/90 sm:grid-cols-2">
          <li>
            ✅ <strong>Audience captive</strong> — un spectateur AIflex regarde un
            film en plein-écran, pas un feed muet en arrière-plan.
          </li>
          <li>
            ✅ <strong>Ciblage par genre</strong> — atteins exactement le public
            d&apos;un thriller, d&apos;une comédie kids ou d&apos;un docu.
          </li>
          <li>
            ✅ <strong>Premium-friendly</strong> — les abonnés Premium ne voient
            jamais de pubs, ce qui maintient la qualité de l&apos;impression sur
            les autres tiers.
          </li>
          <li>
            ✅ <strong>Reporting Stripe Connect</strong> — facturation au CPM,
            budget pré-payé, export CSV mensuel inclus.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-display text-2xl font-bold text-center">
          Demande un contact
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-center text-sm text-flex-muted">
          Notre équipe pubs te contacte sous 48 h ouvrées avec un plan budgétaire
          adapté à ton brief.
        </p>
        <AdvertiseLeadForm />
      </section>

      <footer className="mx-auto max-w-2xl border-t border-flex-border pt-6 text-center text-xs text-flex-muted">
        Tu cherches plutôt à publier ton propre film ?{" "}
        <Link href="/studio" className="text-flex-accent underline">
          Créer un film AIflex
        </Link>
        .
      </footer>
    </div>
  );
}
