"use client";

/**
 * Shimmer skeleton placeholder matching the ContentCard layout.
 * Used in ContentRow during data loading.
 */
export default function SkeletonCard() {
  return (
    <div className="w-[280px] shrink-0 sm:w-[300px] lg:w-[320px]">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-flex-card mb-4">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-flex-card via-flex-border/30 to-flex-card bg-[length:800px_100%]" />
      </div>
      <div className="px-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 rounded bg-flex-border animate-pulse" />
          <div className="h-3 w-10 rounded bg-flex-border animate-pulse" />
        </div>
        <div className="h-5 w-3/4 rounded bg-flex-border animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <section className="my-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-4 space-y-2">
          <div className="h-6 w-40 rounded bg-flex-border animate-pulse" />
          <div className="h-4 w-64 rounded bg-flex-border/50 animate-pulse" />
        </div>
        <div className="flex gap-5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
