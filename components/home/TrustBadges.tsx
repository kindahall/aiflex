"use client";

interface Badge {
  label: string;
  caption: string;
}

const BADGES: Badge[] = [
  { label: "Claude", caption: "IA narrative Anthropic" },
  { label: "GDPR", caption: "Conforme UE" },
  { label: "C2PA", caption: "Content Credentials" },
  { label: "Stripe", caption: "Paiements sécurisés" },
  { label: "AI Act", caption: "Marquage conforme" },
];

export function TrustBadges() {
  return (
    <section
      aria-label="Partenaires et conformité"
      className="border-y border-flex-border bg-flex-panel/50 py-8"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-4 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-flex-muted">
          Technologies & conformité
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {BADGES.map((b) => (
            <li key={b.label} className="flex items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-lg border border-flex-border bg-flex-card px-3 text-xs font-bold tracking-wide text-flex-text">
                {b.label}
              </span>
              <span className="text-[11px] text-flex-muted">{b.caption}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
