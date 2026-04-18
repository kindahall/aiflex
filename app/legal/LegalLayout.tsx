import Link from "next/link";
import type { ReactNode } from "react";

const LEGAL_NAV: { href: string; label: string }[] = [
  { href: "/legal/terms", label: "CGU" },
  { href: "/legal/privacy", label: "Confidentialité" },
  { href: "/legal/ai-disclosure", label: "Transparence IA" },
  { href: "/legal/cgv", label: "CGV" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/dmca", label: "DMCA" },
  { href: "/legal/creator-terms", label: "CGU créateurs" },
  { href: "/legal/community-guidelines", label: "Communauté" },
  { href: "/legal/imprint", label: "Mentions légales" },
];

/**
 * Shared layout for the three legal pages — keeps the navigation, eyebrow,
 * and prose styling consistent. Pages just feed in their title + content.
 */
export default function LegalLayout({
  title,
  eyebrow,
  lastUpdated,
  children,
}: {
  title: string;
  eyebrow: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        {eyebrow}
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">{title}</h1>
      <div className="mb-8 text-xs text-flex-muted">
        Dernière mise à jour : {lastUpdated}
      </div>

      <nav className="mb-10 flex flex-wrap gap-2">
        {LEGAL_NAV.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full border border-flex-border bg-flex-panel px-4 py-1.5 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <article className="prose-legal space-y-4 text-sm leading-relaxed text-flex-text/90">
        {children}
      </article>
    </div>
  );
}
