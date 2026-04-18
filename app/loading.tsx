import LoadingPulse from "@/components/LoadingPulse";

/**
 * Default loading UI for any route segment that suspends. Each page can
 * override this by providing its own loading.tsx alongside its page.tsx.
 */
export default function RootLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <LoadingPulse label="Chargement" />
    </div>
  );
}
