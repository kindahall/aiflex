"use client";

import { useTranslation } from "@/lib/i18n";

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  avatarSeed: string;
}

// Hardcoded for now (static marketing copy). When we have >50 creator case
// studies we can move these into the CMS.
const TESTIMONIALS: Testimonial[] = [
  {
    id: "t1",
    quote:
      "J'ai sorti mon court-métrage sci-fi en 4h. Sans AIflex je serais encore en train de chercher un monteur.",
    author: "Léa Moreau",
    role: "Créatrice, 14k abonnés",
    avatarSeed: "leam",
  },
  {
    id: "t2",
    quote:
      "Le système de suites est génial. Mes fans payent pour la saison 2 — je filme pas, je dirige.",
    author: "Tomás Silva",
    role: "Showrunner IA",
    avatarSeed: "tomas",
  },
  {
    id: "t3",
    quote:
      "Enfin une plateforme où on peut publier du contenu généré sans se faire démonétiser le jour d'après.",
    author: "Ines Baum",
    role: "Storyteller, 92k vues/mois",
    avatarSeed: "inesb",
  },
];

export function TestimonialsSection() {
  const { t } = useTranslation();
  const heading = t("home.testimonials.heading") || "Ils créent déjà avec AIflex";
  const subtitle =
    t("home.testimonials.subtitle") ||
    "Des créateurs ont déjà transformé une idée en film publié et monétisé.";

  return (
    <section
      className="mx-auto my-24 max-w-6xl px-6"
      aria-labelledby="testimonials-heading"
    >
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-flex-border bg-flex-panel px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-flex-accent">
          ✦ témoignages
        </div>
        <h2
          id="testimonials-heading"
          className="font-display text-3xl font-black text-flex-text md:text-4xl"
        >
          {heading}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-flex-muted">{subtitle}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((tm) => (
          <figure
            key={tm.id}
            className="flex flex-col rounded-2xl border border-flex-border bg-flex-card p-6"
          >
            <blockquote className="flex-1 text-sm leading-relaxed text-flex-text">
              <span aria-hidden="true" className="mr-1 text-flex-accent">
                “
              </span>
              {tm.quote}
              <span aria-hidden="true" className="ml-1 text-flex-accent">
                ”
              </span>
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3 border-t border-flex-border pt-4">
              <div
                className="h-9 w-9 rounded-full bg-gradient-to-br from-flex-accent to-flex-accent2"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, hsl(${hash(tm.avatarSeed)}, 70%, 55%), hsl(${(hash(tm.avatarSeed) + 60) % 360}, 70%, 55%))`,
                }}
              />
              <div>
                <div className="text-sm font-semibold text-flex-text">{tm.author}</div>
                <div className="text-[11px] text-flex-muted">{tm.role}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
