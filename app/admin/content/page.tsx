"use client";

import { useEffect, useState } from "react";
import LoadingPulse from "@/components/LoadingPulse";
import { useToast } from "@/components/Toast";
import type { SiteContent } from "@/lib/platform-settings";

/**
 * Admin CMS page — edit all public-facing texts from the dashboard.
 * Changes are applied instantly (saved to DB, no redeploy needed).
 */

const FIELDS: Array<{
  key: keyof SiteContent;
  label: string;
  section: string;
  rows?: number;
}> = [
  // Meta
  { key: "siteTitle", label: "Titre du site (onglet navigateur)", section: "Meta", rows: 1 },
  { key: "siteDescription", label: "Description du site (SEO)", section: "Meta", rows: 2 },
  // Hero
  { key: "heroBadge", label: "Badge au-dessus du titre hero", section: "Accueil — Hero" },
  // CTA
  { key: "ctaBadge", label: "Badge CTA", section: "Accueil — Bloc CTA" },
  { key: "ctaTitle", label: "Titre CTA", section: "Accueil — Bloc CTA" },
  { key: "ctaDescription", label: "Description CTA", section: "Accueil — Bloc CTA", rows: 3 },
  { key: "ctaPrimaryLabel", label: "Bouton principal", section: "Accueil — Bloc CTA" },
  { key: "ctaSecondaryLabel", label: "Bouton secondaire", section: "Accueil — Bloc CTA" },
  // Studio
  { key: "studioEyebrow", label: "Eyebrow (petit texte au-dessus)", section: "Studio IA" },
  { key: "studioTitle", label: "Titre principal", section: "Studio IA" },
  { key: "studioDescription", label: "Description sous le titre", section: "Studio IA", rows: 3 },
];

export default function AdminContentPage() {
  const { toast } = useToast();
  const [content, setContent] = useState<SiteContent | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/site-content", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setContent(d.content))
      .catch(() => toast("error", "Erreur chargement contenu"));
  }, [toast]);

  async function save() {
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteContent: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", "Contenu mis à jour");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (!content) return <LoadingPulse label="Chargement du contenu" />;

  // Group fields by section
  const sections = FIELDS.reduce(
    (acc, f) => {
      (acc[f.section] ||= []).push(f);
      return acc;
    },
    {} as Record<string, typeof FIELDS>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Contenu du site</h2>
          <p className="text-sm text-flex-muted">
            Modifie les textes des pages d&apos;atterrissage. Les
            changements sont visibles immédiatement.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-flex-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer tout"}
        </button>
      </div>

      {Object.entries(sections).map(([section, fields]) => (
        <div
          key={section}
          className="rounded-2xl border border-flex-border bg-flex-card p-5 space-y-4"
        >
          <div className="text-xs font-bold uppercase tracking-widest text-flex-accent">
            {section}
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <label
                htmlFor={`cms-${f.key}`}
                className="!mb-1 !text-[11px]"
              >
                {f.label}
              </label>
              {(f.rows || 1) > 1 ? (
                <textarea
                  id={`cms-${f.key}`}
                  rows={f.rows}
                  value={(content as unknown as Record<string, string>)[f.key] || ""}
                  onChange={(e) =>
                    setContent({ ...content, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  id={`cms-${f.key}`}
                  value={(content as unknown as Record<string, string>)[f.key] || ""}
                  onChange={(e) =>
                    setContent({ ...content, [f.key]: e.target.value })
                  }
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
