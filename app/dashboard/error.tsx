"use client";
import { SegmentErrorBoundary } from "@/components/SegmentErrorBoundary";

export default function DashboardError({
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
      tag="dashboard"
      title="Erreur dans ton dashboard"
      description="Une section de ton dashboard n'a pas pu être chargée."
      homeHref="/dashboard"
      homeLabel="Retour au dashboard"
    />
  );
}
