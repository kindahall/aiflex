import Link from "next/link";

const PRODUCT = [
  { href: "/", label: "Accueil" },
  { href: "/search", label: "Rechercher" },
  { href: "/studio", label: "Studio IA" },
  { href: "/creators", label: "Créateurs" },
  { href: "/pricing", label: "Tarifs" },
  { href: "/dashboard", label: "Dashboard" },
];

const LEGAL = [
  { href: "/legal/terms", label: "CGU" },
  { href: "/legal/privacy", label: "Confidentialité" },
  { href: "/legal/ai-disclosure", label: "Transparence IA" },
];

const CONTACT = [
  { href: "mailto:hello@aiflex.app", label: "hello@aiflex.app" },
  { href: "mailto:moderation@aiflex.app", label: "Signaler un contenu" },
  { href: "mailto:legal@aiflex.app", label: "Questions juridiques" },
];

export default function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/5 bg-flex-panel/60 backdrop-blur-3xl overflow-hidden glass-panel rounded-t-[3rem] pb-6">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-flex-accent/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-flex-accent to-flex-accent2 text-white text-lg font-black shadow-glow transition-transform group-hover:scale-105">
                <div className="absolute inset-0 rounded-lg opacity-50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/40 to-transparent"></div>
                <span className="relative z-10">A</span>
              </div>
              <span className="font-display text-xl font-black tracking-tight text-flex-text transition-colors group-hover:text-flex-accent">
                AI<span className="text-gradient-accent">flex</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-xs text-flex-muted">
              La plateforme où chaque spectateur peut devenir réalisateur.
              Streame, crée et publie des films générés par IA.
            </p>
          </div>

          <FooterColumn title="Produit" links={PRODUCT} />
          <FooterColumn title="Légal" links={LEGAL} />
          <FooterColumn title="Contact" links={CONTACT} />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-flex-border pt-6 text-[11px] text-flex-muted">
          <div>
            © {new Date().getFullYear()} AIflex. Tous droits réservés.
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-flex-accent" />
            <span>
              Tous les films générés par AIflex sont identifiés comme contenus IA conformément à l&apos;EU AI Act.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        {title}
      </div>
      <ul className="space-y-2 text-xs text-flex-text">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="transition hover:text-flex-accent"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
