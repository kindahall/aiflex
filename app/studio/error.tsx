"use client";
import { SegmentErrorBoundary } from "@/components/SegmentErrorBoundary";

export default function StudioError({
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
      tag="studio"
      title="Erreur dans le studio"
      description="Impossible d'afficher cette page du studio. Ton travail en cours n'est pas perdu."
      homeHref="/studio"
      homeLabel="Retour au studio"
    />
  );
}
