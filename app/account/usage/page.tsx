import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMonthlyUsage } from "@/lib/api-usage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mon utilisation API — AIflex",
  description: "Compteurs quotidiens d'utilisation des modèles IA pour ce mois.",
  robots: { index: false },
};

export default async function UsagePage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/account/usage");

  const usage = await getMonthlyUsage(user.id);
  const totalImages = usage.fluxImages;
  const totalSeconds = usage.seedanceSeconds;
  const totalTokens = usage.claudeTokens + usage.openaiTokens;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Mon utilisation</h1>
        <p className="mt-2 max-w-xl text-sm text-flex-muted">
          Consommation API en cours pour le mois <strong>{usage.month}</strong>.
          Mis à jour à chaque génération. Inclut tokens IA, images Flux, secondes
          Seedance, minutes Whisper, caractères ElevenLabs.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tokens narratifs" value={totalTokens.toLocaleString("fr-FR")} sub={`${usage.claudeTokens.toLocaleString("fr-FR")} Claude · ${usage.openaiTokens.toLocaleString("fr-FR")} GPT`} />
        <Stat label="Images Flux" value={totalImages.toLocaleString("fr-FR")} sub="≈ $0.003 pièce" />
        <Stat label="Secondes Seedance" value={totalSeconds.toLocaleString("fr-FR")} sub="≈ $0.022/sec" />
        <Stat label="Doublage ElevenLabs" value={`${usage.elevenLabsChars.toLocaleString("fr-FR")} chars`} sub="≈ $0.30/1k" />
      </section>

      <section className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
        <h2 className="mb-4 font-display text-xl font-semibold">Détail jour par jour</h2>
        {usage.perDay.length === 0 ? (
          <p className="text-sm text-flex-muted">
            Aucune utilisation enregistrée ce mois-ci.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-flex-muted">
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Tokens</th>
                  <th className="pb-3 pr-4 font-medium">Images</th>
                  <th className="pb-3 pr-4 font-medium">Sec. Seedance</th>
                  <th className="pb-3 pr-4 font-medium">Min. Whisper</th>
                  <th className="pb-3 font-medium">ElevenLabs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-flex-border">
                {[...usage.perDay].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="py-2.5 pr-4">
                      {new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      }).format(new Date(d.date))}
                    </td>
                    <td className="py-2.5 pr-4">
                      {(d.claudeTokens + d.openaiTokens).toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2.5 pr-4">{d.fluxImages}</td>
                    <td className="py-2.5 pr-4">{d.seedanceSeconds}</td>
                    <td className="py-2.5 pr-4">{d.whisperMinutes}</td>
                    <td className="py-2.5">{d.elevenLabsChars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-flex-muted">
        Les compteurs sont incrémentés best-effort par les libs serveur. Une
        valeur à zéro alors que tu as généré du contenu peut signifier que
        l&apos;instrumentation n&apos;est pas encore wired sur ce provider — ouvre un
        ticket support si tu vois un écart.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-flex-panel p-4 ring-1 ring-flex-border">
      <div className="text-xs text-flex-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-flex-muted">{sub}</div>}
    </div>
  );
}
