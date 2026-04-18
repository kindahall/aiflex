"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface AdResponse {
  campaignId: string;
  format: "preroll_15" | "midroll_30" | "banner";
  videoUrl: string | null;
  imageUrl: string | null;
  landingUrl: string;
  costCents: number;
}

interface Props {
  slot: "preroll_15" | "midroll_30" | "banner";
  projectId?: string;
  userPlan?: string;
  onComplete: () => void;
  /** If set, show a skip button after N seconds (default: never for pre-roll) */
  allowSkipAfterSeconds?: number | null;
}

/**
 * In-film ad player (V7 §3.6).
 *
 * Flow:
 *  1. Fetch /api/ads/serve?format=<slot>&projectId=... — 204 = no ad → onComplete immediately
 *  2. Render video (pre-roll/mid-roll) or image (banner)
 *  3. On full completion: POST /api/ads/impression (records billing), then onComplete
 *
 * Premium users should never see this — the caller is expected to short-circuit
 * ad fetching for them. This component also no-ops gracefully if the server
 * declines to serve (204 or error).
 */
export default function AdPlayer({
  slot,
  projectId,
  userPlan,
  onComplete,
  allowSkipAfterSeconds = slot === "preroll_15" ? 5 : null,
}: Props) {
  const [ad, setAd] = useState<AdResponse | null | "none">(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Fetch the ad
  useEffect(() => {
    let cancelled = false;
    async function fetchAd() {
      if (userPlan === "premium" || userPlan === "premium_yearly") {
        if (!cancelled) {
          setAd("none");
          onComplete();
        }
        return;
      }
      try {
        const params = new URLSearchParams({ format: slot });
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(`/api/ads/serve?${params.toString()}`);
        if (res.status === 204) {
          if (!cancelled) {
            setAd("none");
            onComplete();
          }
          return;
        }
        if (!res.ok) throw new Error("ad fetch failed");
        const data = (await res.json()) as AdResponse;
        if (!cancelled) setAd(data);
      } catch {
        if (!cancelled) {
          setAd("none");
          onComplete();
        }
      }
    }
    fetchAd();
    return () => {
      cancelled = true;
    };
  }, [slot, projectId, userPlan, onComplete]);

  // 2. Skip timer
  useEffect(() => {
    if (!ad || ad === "none" || allowSkipAfterSeconds == null) return;
    const t = setTimeout(() => setCanSkip(true), allowSkipAfterSeconds * 1000);
    return () => clearTimeout(t);
  }, [ad, allowSkipAfterSeconds]);

  // 3. Record impression (only once)
  const impressionRecorded = useRef(false);
  const recordImpression = useCallback(() => {
    if (!ad || ad === "none" || impressionRecorded.current) return;
    impressionRecorded.current = true;
    fetch("/api/ads/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: ad.campaignId,
        format: ad.format,
        projectId,
      }),
    }).catch(() => {});
  }, [ad, projectId]);

  const handleEnded = () => {
    recordImpression();
    onComplete();
  };

  const handleSkip = () => {
    // Skipped ads don't bill (fraud protection)
    onComplete();
  };

  // Banner: render as an image, record after 3s visible
  useEffect(() => {
    if (!ad || ad === "none" || ad.format !== "banner") return;
    const t = setTimeout(() => {
      recordImpression();
      onComplete();
    }, 3000);
    return () => clearTimeout(t);
  }, [ad, onComplete, recordImpression]);

  // Video: countdown based on current time
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const remain = Math.max(
      0,
      Math.ceil(videoRef.current.duration - videoRef.current.currentTime)
    );
    setRemainingSec(remain);
  };

  if (ad === null) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black text-white/60">
        <div className="text-sm">Chargement publicité…</div>
      </div>
    );
  }
  if (ad === "none") return null;

  if (ad.format === "banner") {
    return (
      <Link
        href={ad.landingUrl}
        target="_blank"
        rel="noopener sponsored"
        className="block"
      >
        {ad.imageUrl && (
          // Using plain img because banners come from varied third-party hosts
          // that may not be whitelisted in next.config.images
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt="Publicité"
            className="w-full rounded-xl border border-flex-border"
          />
        )}
        <div className="mt-1 text-right text-[10px] uppercase tracking-wider text-flex-muted">
          Publicité
        </div>
      </Link>
    );
  }

  // Video ad (pre-roll / mid-roll)
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {ad.videoUrl && (
        <video
          ref={videoRef}
          src={ad.videoUrl}
          autoPlay
          playsInline
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          className="h-full w-full"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/90">
          Publicité · {remainingSec}s
        </span>
        <Link
          href={ad.landingUrl}
          target="_blank"
          rel="noopener sponsored"
          className="pointer-events-auto rounded bg-white/90 px-2 py-0.5 text-[10px] font-medium text-black hover:bg-white"
        >
          En savoir plus →
        </Link>
      </div>

      {canSkip && (
        <button
          onClick={handleSkip}
          className="absolute bottom-4 right-4 rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white hover:bg-black/90"
        >
          Passer la publicité →
        </button>
      )}
    </div>
  );
}
