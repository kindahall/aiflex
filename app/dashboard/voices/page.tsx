import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VoiceCloneForm from "@/components/VoiceCloneForm";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/dashboard/voices");

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { elevenLabsVoiceId: true },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>
      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          IA avancée
        </div>
        <h1 className="font-display text-3xl font-bold">Ta voix clonée</h1>
        <p className="mt-2 max-w-xl text-sm text-flex-muted">
          Clone ta voix en uploadant 30-60s d&apos;échantillon clair.
          Ensuite tu pourras l&apos;utiliser comme narration ou voix off
          dans tes films AIflex.
        </p>
      </header>

      <VoiceCloneForm hasExistingVoice={Boolean(me?.elevenLabsVoiceId)} />

      <section className="mt-10 rounded-3xl border border-flex-border bg-flex-card p-6 text-sm text-flex-muted">
        <h2 className="mb-2 font-medium text-flex-text">Données biométriques</h2>
        <p>
          Une voix clonée est une donnée biométrique au sens du RGPD. AIflex la
          stocke uniquement chez ElevenLabs (et son ID dans notre base) et la
          supprime à la demande depuis cette page ou depuis{" "}
          <Link href="/dashboard/privacy" className="text-flex-accent underline">
            /dashboard/privacy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
