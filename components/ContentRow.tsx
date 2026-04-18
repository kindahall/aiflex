"use client";

import { useRef, useState, useEffect } from "react";
import type { CatalogItem } from "@/lib/types";
import { useHiddenFilms } from "@/lib/useHiddenFilms";
import ContentCard from "./ContentCard";

/**
 * Netflix-style horizontal scrollable row of film cards. Features:
 * - Scroll with drag, mouse wheel, or arrow buttons
 * - Arrow buttons appear only when there's content to scroll
 * - Smooth scroll animation
 * - Responsive card widths
 */
export default function ContentRow({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: CatalogItem[];
}) {
  const { isHidden, hide } = useHiddenFilms();
  const visible = items.filter((i) => !isHidden(i.id));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [visible.length]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector("div")?.offsetWidth || 300;
    const amount = cardWidth * 2;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  if (visible.length === 0) return null;

  return (
    <section className="my-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-black tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-flex-muted">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="group/row relative">
          {/* Left arrow */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scroll("left")}
              className="absolute left-0 top-0 bottom-16 z-10 flex w-12 items-center justify-center bg-gradient-to-r from-flex-bg to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
              aria-label="Défiler à gauche"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flex-panel/90 text-flex-text shadow-md backdrop-blur-md transition hover:scale-110">
                ‹
              </div>
            </button>
          )}

          {/* Scrollable strip */}
          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto hide-scrollbar scroll-smooth pb-2"
          >
            {visible.map((item) => (
              <div
                key={item.id}
                className="w-[280px] shrink-0 sm:w-[300px] lg:w-[320px]"
              >
                <ContentCard item={item} onHide={hide} />
              </div>
            ))}
          </div>

          {/* Right arrow */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scroll("right")}
              className="absolute right-0 top-0 bottom-16 z-10 flex w-12 items-center justify-center bg-gradient-to-l from-flex-bg to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
              aria-label="Défiler à droite"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flex-panel/90 text-flex-text shadow-md backdrop-blur-md transition hover:scale-110">
                ›
              </div>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
