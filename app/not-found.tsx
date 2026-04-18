import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <div className="mb-6 text-8xl font-black tracking-tighter text-flex-muted/30">
        404
      </div>
      <h1 className="mb-3 text-3xl font-black">Page introuvable</h1>
      <p className="mb-8 text-sm text-flex-muted">
        Le film, le profil ou la page que tu cherches n&apos;existe pas — ou
        a été supprimé.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110"
        >
          Explorer le feed
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-flex-border bg-flex-panel px-6 py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
        >
          Rechercher
        </Link>
      </div>
    </div>
  );
}
