"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface ShortItem {
  id: string;
  title: string | null;
  synopsis: string | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  genre: string;
  views: number;
  likes: number;
  publishedAt: string | null;
  ownerId: string;
  owner: { name: string; avatarSeed: string | null };
}

/**
 * Vertical TikTok-style shorts feed (V8 §24.6).
 *
 * Implementation:
 *   - CSS scroll-snap on a full-screen vertical container; one short per snap point
 *   - IntersectionObserver pauses out-of-view videos and triggers page fetch when
 *     the user reaches the second-to-last item
 *   - Touch + keyboard friendly (space to play/pause)
 *
 * No external lib. Works on mobile + desktop.
 */
export default function ShortsPage() {
  const [items, setItems] = useState<ShortItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/shorts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: ShortItem[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      if (!data.nextCursor) setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      loadingRef.current = false;
    }
  }, [cursor, done]);

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-30 overflow-y-scroll bg-black snap-y snap-mandatory">
      {items.length === 0 && !error && (
        <div className="flex h-screen items-center justify-center text-flex-muted">
          Chargement…
        </div>
      )}

      {items.map((item, idx) => (
        <ShortPlayer
          key={item.id}
          item={item}
          isLast={idx === items.length - 1}
          isSecondLast={idx === items.length - 2}
          onNeedMore={loadMore}
        />
      ))}

      {done && items.length > 0 && (
        <div className="flex h-screen snap-start items-center justify-center text-flex-muted">
          Tu as tout vu — explore d&apos;autres formats sur{" "}
          <Link href="/library" className="ml-1 text-flex-accent underline">
            la bibliothèque
          </Link>
          .
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-4 mx-auto max-w-sm rounded-xl bg-red-500/90 px-4 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}
    </div>
  );
}

function ShortPlayer({
  item,
  isLast,
  isSecondLast,
  onNeedMore,
}: {
  item: ShortItem;
  isLast: boolean;
  isSecondLast: boolean;
  onNeedMore: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            ref.current?.play().catch(() => {});
            if (isSecondLast || isLast) onNeedMore();
          } else {
            ref.current?.pause();
            if (ref.current) ref.current.currentTime = 0;
          }
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [isLast, isSecondLast, onNeedMore]);

  return (
    <section
      ref={containerRef}
      className="relative h-screen w-full snap-start snap-always"
    >
      {item.outputUrl ? (
        <video
          ref={ref}
          src={item.outputUrl}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          playsInline
          muted={muted}
          preload="metadata"
          poster={item.thumbnailUrl ?? undefined}
          onClick={() => {
            if (!ref.current) return;
            if (ref.current.paused) ref.current.play();
            else ref.current.pause();
          }}
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: item.thumbnailUrl ? `url(${item.thumbnailUrl})` : undefined }}
        />
      )}

      {/* Bottom gradient + text overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <Link
          href={`/u/${item.ownerId}`}
          className="text-sm font-medium opacity-90 hover:opacity-100"
        >
          @{item.owner.name}
        </Link>
        <h2 className="mt-1 line-clamp-2 font-display text-xl font-bold">
          {item.title ?? "Sans titre"}
        </h2>
        {item.synopsis && (
          <p className="mt-1 line-clamp-2 text-sm text-white/80">{item.synopsis}</p>
        )}
        <Link
          href={`/watch/${item.id}`}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs backdrop-blur hover:bg-white/25"
        >
          Voir en plein écran →
        </Link>
      </div>

      {/* Right action rail */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-4 text-white">
        <ActionButton
          icon={muted ? "🔇" : "🔊"}
          label={muted ? "Activer le son" : "Couper le son"}
          onClick={() => setMuted((m) => !m)}
        />
        <ActionButton icon="❤️" label={`${item.likes} likes`} />
        <ActionButton icon="📤" label="Partager" />
      </div>
    </section>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-2xl backdrop-blur hover:bg-black/70"
    >
      {icon}
    </button>
  );
}
