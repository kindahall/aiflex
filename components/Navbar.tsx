"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useTheme } from "@/components/ThemeProvider";
import { useTranslation } from "@/lib/i18n";
import NotificationBell from "@/components/NotificationBell";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();
  const {
    user,
    loading,
    logout,
    isAdminView,
    isRealAdmin,
    setViewMode,
  } = useAuth();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock body scroll while the mobile menu is open so the drawer stays put.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Close mobile menu on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const navLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/trending", label: t("nav.trending") },
    { href: "/creators", label: t("nav.creators") },
    { href: "/search", label: t("nav.search") },
    ...(user
      ? [
          { href: "/studio", label: t("nav.studio") },
          { href: "/dashboard", label: t("nav.dashboard") },
          { href: "/watchlist", label: t("nav.watchlist") },
          ...(isAdminView ? [{ href: "/admin", label: t("nav.admin") }] : []),
        ]
      : []),
  ];

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    setMobileOpen(false);
    router.push("/");
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <header className="fixed top-4 left-0 right-0 z-40 px-4 sm:px-6 transition-all duration-500">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl glass-panel bg-flex-panel/40 px-4 transition-all duration-300 hover:bg-flex-panel/50">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-flex-accent to-flex-accent2 text-white text-lg font-black shadow-glow transition-transform group-hover:scale-105">
            <div className="absolute inset-0 rounded-lg opacity-50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/40 to-transparent"></div>
            <span className="relative z-10">A</span>
          </div>
          <span className="font-display text-xl font-black tracking-tight text-flex-text transition-colors group-hover:text-flex-accent">
            AI<span className="text-gradient-accent">flex</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" role="navigation" aria-label="Navigation principale">
          {navLinks.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`group relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-flex-text font-bold"
                    : "text-flex-muted hover:text-flex-text"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-flex-text shadow-sm" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right-side controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-flex-panel border border-flex-border/50 text-flex-text hover:bg-flex-muted/10 transition-colors"
            aria-label="Changer le thème"
          >
            {mounted && theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>

          <LanguageSwitcher />

          <NotificationBell />

          {/* Desktop auth buttons */}
          {!loading && !user && (
            <div className="hidden gap-2 md:flex">
              <Link
                href="/login"
                className="ml-2 rounded-xl border border-white/5 bg-flex-card/80 backdrop-blur-md px-4 py-2 text-sm font-semibold text-flex-text shadow-sm transition-all hover:bg-flex-muted/10 hover:border-flex-border"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/login"
                className="relative rounded-xl bg-gradient-to-r from-flex-accent to-flex-accent2 px-4 py-2 text-sm font-bold text-white shadow-glow transition-all hover:scale-105 hover:shadow-glowSm inner-glow overflow-hidden group"
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite_linear] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                <span className="relative z-10">{t("nav.signup")}</span>
              </Link>
            </div>
          )}

          {/* Desktop user menu */}
          {user && (
            <div className="relative ml-1 hidden md:block">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Menu utilisateur"
                className="flex items-center gap-2 rounded-lg border border-flex-border bg-flex-card px-3 py-1.5 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-flex-accent text-xs font-black text-white">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[100px] truncate lg:inline">
                  {user.name}
                </span>
                <span className="text-[10px] text-flex-muted">▾</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-flex-border bg-flex-card shadow-cinema">
                    <div className="border-b border-flex-border px-4 py-3">
                      <div className="text-sm font-bold">{user.name}</div>
                      <div className="truncate text-xs text-flex-muted">{user.email}</div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="inline-block rounded-full bg-flex-accent2/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-flex-accent2">
                          {isRealAdmin ? "Admin" : "Créateur"}
                        </span>
                      </div>
                    </div>
                    <ul className="py-1 text-sm">
                      <li><Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.dashboard")}</Link></li>
                      <li><Link href="/studio" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.newFilm")}</Link></li>
                      <li><Link href="/watchlist" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.watchlist")}</Link></li>
                      <li><Link href="/messages" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.messages")}</Link></li>
                      <li><Link href="/notifications" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.notifications")}</Link></li>
                      <li><Link href="/profiles" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-text transition hover:bg-flex-panel">{t("nav.profiles")}</Link></li>
                      {isAdminView && (
                        <li><Link href="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-flex-accent transition hover:bg-flex-panel">{t("nav.adminPanel")}</Link></li>
                      )}
                      {isRealAdmin && (
                        <li className="border-t border-flex-border">
                          {isAdminView ? (
                            <button type="button" onClick={() => { setViewMode("user"); setMenuOpen(false); router.push("/dashboard"); }} className="block w-full px-4 py-2 text-left text-flex-muted transition hover:bg-flex-panel hover:text-flex-accent">
                              Vue créateur
                            </button>
                          ) : (
                            <button type="button" onClick={() => { setViewMode("admin"); setMenuOpen(false); }} className="block w-full px-4 py-2 text-left text-flex-accent transition hover:bg-flex-panel">
                              Revenir en admin
                            </button>
                          )}
                        </li>
                      )}
                      <li className="border-t border-flex-border">
                        <button type="button" onClick={handleLogout} className="block w-full px-4 py-2 text-left text-flex-muted transition hover:bg-flex-panel hover:text-red-400">
                          Se déconnecter
                        </button>
                      </li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-flex-border/50 bg-flex-panel text-flex-text transition hover:bg-flex-muted/10 md:hidden"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" onClick={closeMobile} />
          <div className="fixed top-20 left-4 right-4 z-40 overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema animate-fadeUp md:hidden">
            <nav className="divide-y divide-flex-border" role="navigation" aria-label="Navigation mobile">
              {navLinks.map((link) => {
                const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobile}
                    aria-current={active ? "page" : undefined}
                    className={`block px-5 py-3.5 text-sm font-medium transition ${
                      active ? "text-flex-accent font-bold" : "text-flex-text hover:bg-flex-panel"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {!loading && !user && (
                <>
                  <Link href="/login" onClick={closeMobile} className="block px-5 py-3.5 text-sm font-semibold text-flex-accent transition hover:bg-flex-panel">
                    Se connecter / S&apos;inscrire
                  </Link>
                </>
              )}
              {user && (
                <>
                  <Link href="/messages" onClick={closeMobile} className="block px-5 py-3.5 text-sm text-flex-text transition hover:bg-flex-panel">
                    {t("nav.messages")}
                  </Link>
                  <Link href="/notifications" onClick={closeMobile} className="block px-5 py-3.5 text-sm text-flex-text transition hover:bg-flex-panel">
                    {t("nav.notifications")}
                  </Link>
                  <Link href="/profiles" onClick={closeMobile} className="block px-5 py-3.5 text-sm text-flex-text transition hover:bg-flex-panel">
                    {t("nav.profiles")}
                  </Link>
                  <Link href={`/u/${user.id}`} onClick={closeMobile} className="block px-5 py-3.5 text-sm text-flex-text transition hover:bg-flex-panel">
                    {t("nav.myProfile")}
                  </Link>
                  <button type="button" onClick={handleLogout} className="block w-full px-5 py-3.5 text-left text-sm text-flex-muted transition hover:bg-flex-panel hover:text-red-400">
                    {t("auth.logout")}
                  </button>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
