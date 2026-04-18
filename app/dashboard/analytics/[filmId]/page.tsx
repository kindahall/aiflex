import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { getProjectAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ filmId: string }>;
}) {
  const { filmId } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/login?redirect=/dashboard/analytics/${filmId}`);

  const data = await getProjectAnalytics(filmId, user.id);
  if (!data) notFound();

  const { project, last30Days, totals } = data;
  const maxViews = Math.max(1, ...last30Days.map((d) => d.views));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Retour au dashboard
      </Link>

      <header className="mb-10 flex flex-col items-start gap-5 animate-fadeUp sm:flex-row">
        <div className="relative h-32 w-48 flex-shrink-0 overflow-hidden rounded-2xl shadow-cinema ring-1 ring-flex-border">
          {project.thumbnailUrl ? (
            <Image src={project.thumbnailUrl} alt={project.title ?? ""} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-flex-card text-flex-muted">—</div>
          )}
        </div>
        <div className="flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
            Analytics · 30 jours
          </div>
          <h1 className="font-display text-3xl font-bold">{project.title ?? "Sans titre"}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-flex-card px-3 py-1 text-flex-muted">
              {project.visibility}
            </span>
            <span className="rounded-full bg-flex-card px-3 py-1 text-flex-muted">
              Publié le{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(project.createdAt)}
            </span>
          </div>
        </div>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vues 30j" value={totals.views.toLocaleString("fr-FR")} />
        <Stat
          label="Spectateurs uniques"
          value={totals.uniqueViewers.toLocaleString("fr-FR")}
        />
        <Stat
          label="Complétion moyenne"
          value={`${Math.round(totals.avgCompletion)}%`}
        />
        <Stat
          label="Revenu 30j"
          value={`$${(totals.revenueCents / 100).toFixed(2)}`}
          highlight
        />
      </section>

      <section className="mb-10 rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
        <h2 className="mb-4 font-display text-xl font-semibold">Vues par jour</h2>
        {last30Days.length === 0 ? (
          <p className="text-sm text-flex-muted">
            Pas encore de données agrégées. Les statistiques sont calculées chaque
            nuit à 02:00 UTC.
          </p>
        ) : (
          <BarChart data={last30Days} max={maxViews} />
        )}
      </section>

      <section className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
        <h2 className="mb-4 font-display text-xl font-semibold">Détail jour par jour</h2>
        {last30Days.length === 0 ? (
          <p className="text-sm text-flex-muted">Pas encore de données.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-flex-muted">
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Vues</th>
                  <th className="pb-3 pr-4 font-medium">Uniques</th>
                  <th className="pb-3 pr-4 font-medium">Complétion</th>
                  <th className="pb-3 font-medium">Revenu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-flex-border">
                {[...last30Days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="py-2.5 pr-4">
                      {new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      }).format(new Date(d.date))}
                    </td>
                    <td className="py-2.5 pr-4">{d.views}</td>
                    <td className="py-2.5 pr-4 text-flex-muted">{d.uniqueViewers}</td>
                    <td className="py-2.5 pr-4 text-flex-muted">
                      {Math.round(d.avgCompletion)}%
                    </td>
                    <td className="py-2.5 text-flex-accent">
                      ${(d.revenueCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-flex-muted">
        Les revenus sont une estimation basée sur les vues qualifiées et le
        prorata du mois en cours. Le montant définitif est fixé le 1er du mois
        suivant dans{" "}
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
      className={`rounded-2xl p-4 ${
        highlight
          ? "bg-flex-accent/10 ring-1 ring-flex-accent/30"
          : "bg-flex-panel ring-1 ring-flex-border"
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

function BarChart({
  data,
  max,
}: {
  data: Array<{ date: string; views: number }>;
  max: number;
}) {
  // Simple inline SVG bar chart — avoids installing recharts.
  const width = Math.max(400, data.length * 18);
  const height = 180;
  const padding = 24;
  const barW = (width - padding * 2) / data.length - 2;

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Graphique des vues par jour"
        className="max-w-full"
      >
        {data.map((d, i) => {
          const h = (d.views / max) * (height - padding * 2);
          const x = padding + i * (barW + 2);
          const y = height - padding - h;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h || 1}
                rx={3}
                className="fill-flex-accent transition-opacity hover:opacity-80"
              >
                <title>
                  {d.date} — {d.views} vue{d.views > 1 ? "s" : ""}
                </title>
              </rect>
            </g>
          );
        })}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-flex-border"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
