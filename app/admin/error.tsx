"use client";
import { SegmentErrorBoundary } from "@/components/SegmentErrorBoundary";

export default function AdminError({
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
      tag="admin"
      title="Erreur dans l'admin"
      description="Une section de la console admin a planté. Les autres sections restent accessibles."
      homeHref="/admin"
      homeLabel="Retour à l'admin"
    />
  );
}
