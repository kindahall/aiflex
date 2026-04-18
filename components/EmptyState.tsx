import Link from "next/link";

/**
 * Consistent empty state component. Every empty list/section in the app
 * should use this to maintain a uniform, professional look.
 */
export default function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  icon: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center animate-fadeUp">
      <div className="mb-3 text-5xl">{icon}</div>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
        {description}
      </p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
