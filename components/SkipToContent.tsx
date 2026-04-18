"use client";

export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="fixed left-4 top-2 z-[100] -translate-y-full rounded-lg bg-flex-accent px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-flex-accent focus:ring-offset-2"
    >
      Aller au contenu principal
    </a>
  );
}
