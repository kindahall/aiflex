"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Mode = "login" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-16" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams?.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        mode === "login" ? { email, password } : { email, password, name };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      // Handle 2FA requirement
      if (data.requires2FA) {
        setNeeds2FA(true);
        return;
      }
      window.dispatchEvent(new Event("aiflex:auth-changed"));
      router.push(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        {mode === "login" ? "Bon retour" : "Rejoins AIflex"}
      </div>
      <h1 className="mb-3 text-4xl font-black tracking-tight">
        {mode === "login" ? "Connecte-toi" : "Crée ton compte"}
      </h1>
      <p className="mb-8 text-sm text-flex-muted">
        {mode === "login"
          ? "Reprends tes projets là où tu les as laissés."
          : "Crée, publie et partage tes films générés par IA."}
      </p>

      {/* OAuth buttons */}
      <div className="mb-4 space-y-3 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
        <a
          href="/api/auth/oauth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-flex-border bg-flex-panel py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent hover:bg-flex-muted/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </a>
        <a
          href="/api/auth/oauth/github"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-flex-border bg-flex-panel py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent hover:bg-flex-muted/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Continuer avec GitHub
        </a>
        <a
          href="/api/auth/oauth/apple"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-flex-border bg-flex-panel py-3 text-sm font-semibold text-flex-text transition hover:border-flex-accent hover:bg-flex-muted/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continuer avec Apple
        </a>
      </div>

      {/* Divider */}
      <div className="mb-4 flex items-center gap-4">
        <div className="h-px flex-1 bg-flex-border" />
        <span className="text-xs font-semibold uppercase tracking-widest text-flex-muted">ou</span>
        <div className="h-px flex-1 bg-flex-border" />
      </div>

      {/* 2FA verification step */}
      {needs2FA && (
        <div className="mb-4 space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema">
          <div className="text-center">
            <div className="text-4xl mb-3">🔐</div>
            <h2 className="text-lg font-bold text-flex-text">Vérification 2FA</h2>
            <p className="text-xs text-flex-muted mt-1">
              Entre le code de ton application d&apos;authentification ou un code de récupération.
            </p>
          </div>
          <input
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
            placeholder="Code à 6 chiffres"
            className="w-full rounded-xl bg-flex-surface px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
            maxLength={8}
            autoFocus
          />
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              ⚠ {error}
            </div>
          )}
          <button
            type="button"
            disabled={loading || totpCode.length < 6}
            onClick={async () => {
              setError(null);
              setLoading(true);
              try {
                const res = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ email, password, totpCode }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Code invalide");
                window.dispatchEvent(new Event("aiflex:auth-changed"));
                router.push(nextUrl);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Erreur");
              } finally {
                setLoading(false);
              }
            }}
            className="w-full rounded-xl bg-flex-accent py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Vérification…" : "Vérifier"}
          </button>
          <button
            type="button"
            onClick={() => { setNeeds2FA(false); setTotpCode(""); setError(null); }}
            className="w-full text-xs text-flex-muted hover:text-flex-accent transition"
          >
            ← Retour
          </button>
        </div>
      )}

      <form
        onSubmit={submit}
        className={`space-y-4 rounded-2xl border border-flex-border bg-flex-card p-6 shadow-cinema ${needs2FA ? "hidden" : ""}`}
      >
        {mode === "signup" && (
          <div>
            <label htmlFor="name">Nom</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ton nom public"
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 caractères minimum"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "login" ? (
            <div className="mt-1 text-right">
              <Link
                href="/forgot-password"
                className="text-[11px] font-semibold text-flex-muted underline-offset-4 hover:text-flex-accent hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
          ) : (
            <div
              className={`mt-1 text-[10px] font-medium transition-colors ${
                password.length === 0
                  ? "text-flex-muted"
                  : password.length < 6
                    ? "text-red-400"
                    : "text-emerald-400"
              }`}
            >
              {password.length === 0
                ? "6 caractères minimum"
                : password.length < 6
                  ? `${password.length}/6 — trop court`
                  : "✓ Longueur OK"}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-flex-accent py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {loading
            ? "Un instant…"
            : mode === "login"
              ? "Se connecter"
              : "Créer mon compte"}
        </button>

        <div className="text-center text-xs text-flex-muted">
          {mode === "login" ? (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                className="font-semibold text-flex-accent hover:underline"
                onClick={() => setMode("signup")}
              >
                Inscris-toi
              </button>
            </>
          ) : (
            <>
              Déjà inscrit ?{" "}
              <button
                type="button"
                className="font-semibold text-flex-accent hover:underline"
                onClick={() => setMode("login")}
              >
                Se connecter
              </button>
            </>
          )}
        </div>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-xs text-flex-muted underline-offset-4 hover:underline"
        >
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
