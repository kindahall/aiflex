"use client";
import { SegmentErrorBoundary } from "@/components/SegmentErrorBoundary";

export default function WatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorBoundary
      error={error}
      reset={reset}
      tag="watch"
      title="Lecture impossible"
      description="Ce projet n'a pas pu être chargé. Essaye à nouveau ou reviens à la découverte."
      homeHref="/"
      homeLabel="Découvrir d'autres projets"
    />
  );
}
