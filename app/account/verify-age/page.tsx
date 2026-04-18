import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VerifyAgeForm from "@/components/VerifyAgeForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vérification d'âge — AIflex",
  description:
    "Vérifie ton âge pour accéder aux contenus adultes selon les législations UK OSA, DSA EU et Texas HB 1181.",
  robots: { index: false },
};

export default async function VerifyAgePage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/account/verify-age");

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ageVerified: true, ageVerifiedAt: true },
  });
  const currentLevel = me?.ageVerified ?? "none";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Conformité
        </div>
        <h1 className="font-display text-3xl font-bold">Vérification d&apos;âge</h1>
        <p className="mt-2 max-w-xl text-sm text-flex-muted">
          Certains contenus AIflex sont réservés aux personnes majeures. Ces
          régulations (UK Online Safety Act, DSA EU, Texas HB 1181) imposent
          une vérification AVANT l&apos;accès. Ta vérification est valable pour
          tous les profils de ton compte.
        </p>
      </header>

      <section className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
        <CurrentStatus level={currentLevel} verifiedAt={me?.ageVerifiedAt} />
        <hr className="my-6 border-flex-border" />
        <VerifyAgeForm currentLevel={currentLevel} />
      </section>

      <p className="mt-6 text-xs text-flex-muted">
        AIflex ne stocke jamais une copie de ta pièce d&apos;identité. La
        vérification est traitée par notre prestataire (Yoti) qui ne nous
        renvoie que le statut « majeur · oui/non ».
      </p>
    </div>
  );
}

function CurrentStatus({
  level,
  verifiedAt,
}: {
  level: string;
  verifiedAt: Date | null | undefined;
}) {
  const labels: Record<string, { label: string; cls: string; icon: string }> = {
    none: {
      label: "Aucune vérification",
      cls: "bg-flex-card text-flex-muted",
      icon: "—",
    },
    self_declared: {
      label: "Auto-déclaration enregistrée",
      cls: "bg-amber-500/10 text-amber-400",
      icon: "🟡",
    },
    verified: {
      label: "Identité vérifiée",
      cls: "bg-emerald-500/10 text-emerald-400",
      icon: "✓",
    },
  };
  const cfg = labels[level] ?? labels.none;
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${cfg.cls}`}
      >
        {cfg.icon}
      </div>
      <div>
        <div className="font-medium">{cfg.label}</div>
        {verifiedAt && (
          <div className="text-xs text-flex-muted">
            Le{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(verifiedAt))}
          </div>
        )}
      </div>
    </div>
  );
}
