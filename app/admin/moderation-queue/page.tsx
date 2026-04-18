import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listPendingReports } from "@/lib/reports";
import ReportDecisionPanel from "@/components/admin/ReportDecisionPanel";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<string, { label: string; cls: string }> = {
  csam: { label: "CSAM 🚨", cls: "bg-red-500/20 text-red-300" },
  copyright: { label: "Copyright", cls: "bg-amber-500/20 text-amber-300" },
  hate: { label: "Haine", cls: "bg-red-500/15 text-red-400" },
  inappropriate: { label: "Inapproprié", cls: "bg-flex-card text-flex-muted" },
  spam: { label: "Spam", cls: "bg-flex-card text-flex-muted" },
  other: { label: "Autre", cls: "bg-flex-card text-flex-muted" },
};

/**
 * Severity-sorted moderation queue (V8 §19.5 + §19.1).
 *
 * Reads from the Prisma `Report` table, sorts by severity then age, and
 * lets admins apply a typed decision (removed / warned / suspended / none)
 * which goes through the audit log + notifies the affected user.
 *
 * Coexists with the older client-side `/admin/reports` page that's wired
 * to the JSON DB — that one stays for legacy review until both code paths
 * converge.
 */
export default async function ModerationQueuePage() {
  const user = await requireUser().catch(() => null);
  if (!user || user.role !== "admin") {
    redirect("/login?redirect=/admin/moderation-queue");
  }

  const reports = await listPendingReports(200);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl font-bold">File de modération</h1>
          <span className="rounded-full bg-flex-accent/10 px-3 py-1 text-sm font-medium text-flex-accent">
            {reports.length} en attente
          </span>
        </div>
        <p className="mt-2 text-sm text-flex-muted">
          Triée par sévérité (CSAM &gt; copyright &gt; haine &gt; autres),
          puis par ancienneté. Les signalements CSAM sur projets ont déjà
          quarantiné le contenu — décide ici de l&apos;action finale.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="rounded-3xl border border-flex-border bg-flex-panel p-12 text-center">
          <div className="mb-2 text-4xl">✨</div>
          <h2 className="font-display text-xl font-semibold">File vide</h2>
          <p className="mt-1 text-sm text-flex-muted">
            Aucun signalement à traiter en ce moment.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => {
            const sev = SEVERITY_LABEL[r.reason] ?? SEVERITY_LABEL.other;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-flex-border bg-flex-panel p-5 shadow-cinema"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-baseline gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${sev.cls}`}
                      >
                        {sev.label}
                      </span>
                      <span className="text-xs text-flex-muted">
                        {r.targetType} · {r.targetId.slice(0, 12)}…
                      </span>
                      <time className="text-xs text-flex-muted">
                        {new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(r.createdAt)}
                      </time>
                    </div>
                    {r.detail && (
                      <p className="mb-3 text-sm text-flex-muted">{r.detail}</p>
                    )}
                    <p className="text-xs text-flex-muted">
                      par <strong>{r.reporter.name}</strong> ({r.reporter.email})
                    </p>
                    {r.targetType === "project" && (
                      <Link
                        href={`/watch/${r.targetId}`}
                        target="_blank"
                        rel="noopener"
                        className="mt-2 inline-block text-xs text-flex-accent hover:underline"
                      >
                        Voir le contenu signalé →
                      </Link>
                    )}
                  </div>
                  <div className="w-full flex-shrink-0 sm:w-72">
                    <ReportDecisionPanel reportId={r.id} severity={r.reason} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
