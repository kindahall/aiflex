"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import { useAuth } from "@/lib/useAuth";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/projects", label: "Projets" },
  { href: "/admin/reports", label: "Signalements" },
  { href: "/admin/settings", label: "Modèles & API" },
  { href: "/admin/content", label: "Contenu" },
  { href: "/admin/security", label: "Sécurité" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login?next=/admin");
      return;
    }
    if (user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20">
        <LoadingPulse label="Vérification des droits administrateur" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Administration AIflex
      </div>
      <h1 className="mb-6 text-4xl font-black tracking-tight">
        Panneau de contrôle
      </h1>

      <nav className="mb-8 flex flex-wrap gap-2 border-b border-flex-border">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-t-lg px-5 py-3 text-sm font-semibold transition ${
                active
                  ? "border-b-2 border-flex-accent text-flex-text"
                  : "text-flex-muted hover:text-flex-text"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
