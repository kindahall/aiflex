"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface TreeNode {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  ownerId: string;
  views: number;
  createdAt: string;
  children: TreeNode[];
}

interface Props {
  filmId: string;
  /** Hide if no sequels exist. Default: true */
  hideWhenEmpty?: boolean;
}

/**
 * Extended-universe tree for a public film (V7 §4.5).
 * Fetches /api/films/[id]/sequels which returns 3 levels of disavowal-filtered
 * sequels ordered by views. Renders as a visually grouped grid, not a true
 * graph — a nested graph on mobile is unreadable.
 */
export default function SequelTree({ filmId, hideWhenEmpty = true }: Props) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/films/${filmId}/sequels`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTree(data.tree ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filmId]);

  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-2xl bg-flex-card" aria-hidden />
    );
  }
  if (!tree || tree.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className="rounded-2xl border border-dashed border-flex-border p-10 text-center text-sm text-flex-muted">
        Aucune suite n&apos;a encore été générée pour ce film.
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold">Univers étendu</h2>
        <span className="text-xs text-flex-muted">
          {countNodes(tree)} suites et suites-de-suites
        </span>
      </div>
      <TreeLevel nodes={tree} depth={0} />
    </section>
  );
}

function TreeLevel({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  if (nodes.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <Card key={node.id} node={node} depth={depth} />
        ))}
      </div>
      {nodes.some((n) => n.children.length > 0) && (
        <div className="ml-4 border-l-2 border-flex-border pl-6">
          {nodes
            .filter((n) => n.children.length > 0)
            .map((n) => (
              <div key={n.id} className="mb-6">
                <div className="mb-2 text-xs font-medium text-flex-muted">
                  ↳ Suites de &laquo;{n.title || "Sans titre"}&raquo;
                </div>
                <TreeLevel nodes={n.children} depth={depth + 1} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Card({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <Link
      href={`/watch/${node.id}`}
      className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-panel transition hover:border-flex-accent/50 hover:shadow-cinema"
    >
      <div className="relative aspect-video bg-flex-card">
        {node.thumbnailUrl ? (
          <Image
            src={node.thumbnailUrl}
            alt={node.title ?? ""}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-flex-muted">—</div>
        )}
        {depth > 0 && (
          <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90">
            Niveau {depth + 1}
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 font-medium group-hover:text-flex-accent">
          {node.title || "Sans titre"}
        </h3>
        <div className="mt-1 flex items-center justify-between text-xs text-flex-muted">
          <span>{formatViews(node.views)} vues</span>
          <span>{relativeDate(node.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "aujourd'hui";
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)}sem`;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
