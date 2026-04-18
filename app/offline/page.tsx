"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 text-6xl">📡</div>
      <h1 className="font-display text-3xl font-bold text-flex-text mb-4">
        Hors connexion
      </h1>
      <p className="text-flex-muted max-w-md mb-8">
        Tu es actuellement hors ligne. Vérifie ta connexion internet et
        réessaie. Certaines pages déjà visitées restent disponibles en cache.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-flex-accent px-6 py-3 text-sm font-bold text-white transition hover:bg-flex-accent/90"
      >
        Réessayer
      </button>
    </div>
  );
}
