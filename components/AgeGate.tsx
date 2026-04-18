"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "aiflex.ageVerified.v1";

interface Props {
  /**
   * When true, render the protected children. When false, show a splash
   * gate and block access. The gate is resolvable via:
   *   - Self-declaration (stored in localStorage) — suitable for contenu adulte général
   *   - KYC via Yoti (redirects to /account/verify-age) — required by UK OSA, Texas HB1181
   */
  children: React.ReactNode;
  /** If true, a full KYC (Yoti) is required — self-declaration alone won't pass. */
  requireVerified?: boolean;
}

export default function AgeGate({ children, requireVerified = false }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "loading" | "passed" | "blocked" | "needs-kyc"
  >("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // TODO: in production, also hit `/api/me` to check `user.ageVerified` and
    // prefer that over the local flag. For now we rely on the client flag so
    // this component remains SSR-safe.
    const flag = localStorage.getItem(STORAGE_KEY);
    if (flag === "verified") {
      setStatus("passed");
      return;
    }
    if (flag === "self_declared" && !requireVerified) {
      setStatus("passed");
      return;
    }
    if (flag === "self_declared" && requireVerified) {
      setStatus("needs-kyc");
      return;
    }
    setStatus("blocked");
  }, [requireVerified]);

  function confirmAdult() {
    localStorage.setItem(STORAGE_KEY, "self_declared");
    setStatus(requireVerified ? "needs-kyc" : "passed");
  }

  if (status === "loading") {
    return <div className="h-32" aria-hidden />;
  }
  if (status === "passed") {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-flex-bg/95 backdrop-blur-xl">
      <div className="mx-4 w-full max-w-md animate-fadeUp rounded-3xl border border-flex-border bg-flex-panel p-8 shadow-cinema">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-2xl">
          18+
        </div>

        {status === "blocked" && (
          <>
            <h1 className="font-display text-2xl font-bold">Contenu adulte</h1>
            <p className="mt-2 text-sm text-flex-muted">
              Ce contenu est réservé aux personnes majeures. En continuant, tu
              confirmes avoir au moins 18 ans et comprendre que ce contenu peut
              inclure des thèmes adultes.
            </p>
            <div className="mt-6 space-y-2">
              <button
                onClick={confirmAdult}
                className="w-full rounded-full bg-flex-accent px-5 py-3 text-sm font-medium text-white hover:brightness-110"
              >
                J&apos;ai 18 ans ou plus — continuer
              </button>
              <button
                onClick={() => router.back()}
                className="w-full rounded-full border border-flex-border px-5 py-3 text-sm hover:bg-flex-card"
              >
                Retour
              </button>
            </div>
            <p className="mt-4 text-[11px] text-flex-muted">
              Pour une protection renforcée des mineurs, active le{" "}
              <Link href="/account/parental" className="text-flex-accent underline">
                contrôle parental
              </Link>
              .
            </p>
          </>
        )}

        {status === "needs-kyc" && (
          <>
            <h1 className="font-display text-2xl font-bold">
              Vérification d&apos;âge requise
            </h1>
            <p className="mt-2 text-sm text-flex-muted">
              Ce contenu requiert une vérification officielle de ton âge
              (législation UK Online Safety Act / Texas HB 1181). La
              vérification prend 30 secondes, elle est réalisée par un tiers
              (Yoti) et nous ne stockons jamais de copie de tes documents.
            </p>
            <div className="mt-6 space-y-2">
              <Link
                href="/account/verify-age"
                className="block w-full rounded-full bg-flex-accent px-5 py-3 text-center text-sm font-medium text-white hover:brightness-110"
              >
                Vérifier mon âge (30s)
              </Link>
              <button
                onClick={() => router.back()}
                className="w-full rounded-full border border-flex-border px-5 py-3 text-sm hover:bg-flex-card"
              >
                Retour
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
