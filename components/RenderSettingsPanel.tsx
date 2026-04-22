"use client";

import Link from "next/link";
import { useState } from "react";
import type { ColorSpace, LutPreset, MasterCodec } from "@/lib/types";

type AudioLayout =
  | "stereo"
  | "5.1"
  | "7.1"
  | "ambisonic"
  | "ambisonic-hoa2"
  | "ambisonic-hoa3"
  | "atmos"
  | "atmos-stub";

const LUT_OPTIONS: { id: LutPreset; label: string; hint: string }[] = [
  { id: "none", label: "Aucun", hint: "Rendu brut du modèle, aucune cohérence imposée" },
  { id: "cinema", label: "Cinéma", hint: "Courbe S légère, highlights chauds, ombres froides" },
  { id: "noir", label: "Noir", hint: "N&B contrasté" },
  { id: "teal-orange", label: "Teal & Orange", hint: "Look blockbuster moderne" },
  { id: "desat", label: "Désaturé", hint: "Look documentaire, saturation -40%" },
  { id: "warm", label: "Warm", hint: "Golden hour, doré chaleureux" },
  { id: "aces-rec709", label: "ACES Rec.709", hint: "RRT + sRGB ODT, look cinéma référence" },
  { id: "aces-rec2020", label: "ACES Rec.2020", hint: "RRT + Rec.2020 ODT, SDR wide-gamut" },
  { id: "aces-pq1000", label: "ACES HDR10", hint: "RRT + Rec.2020 PQ, 1000 nits" },
  {
    id: "aces-v2-rec709-true",
    label: "ACES 2.0 vrai — Rec.709",
    hint: "OCIO 33³ officiel, broadcast SDR",
  },
  { id: "aces-v2-p3-true", label: "ACES 2.0 vrai — DCI-P3", hint: "OCIO 33³ officiel, cinéma D65" },
  {
    id: "aces-v2-pq1000-true",
    label: "ACES 2.0 vrai — HDR 1000",
    hint: "OCIO 33³ officiel, PQ 1000 nits",
  },
  {
    id: "aces-v2-pq4000-true",
    label: "ACES 2.0 vrai — HDR 4000",
    hint: "OCIO 33³ officiel, référence 4000 nits",
  },
];

const FPS_OPTIONS: { id: 24 | 30 | 60; label: string; hint: string }[] = [
  { id: 24, label: "24 fps", hint: "Cinéma / aspect filmique" },
  { id: 30, label: "30 fps", hint: "Standard streaming (YouTube, TikTok)" },
  { id: 60, label: "60 fps", hint: "Fluide (gameplay, sport, motion)" },
];

type MasterOpt = MasterCodec | "off";
type HdrPeak = 600 | 1000 | 4000 | 10000;

interface Props {
  lutPreset: LutPreset | undefined;
  targetFps: 24 | 30 | 60 | undefined;
  masterCodec: MasterCodec | undefined;
  colorSpace: ColorSpace | undefined;
  hdrPeakNits: HdrPeak | undefined;
  audioLayout: AudioLayout | undefined;
  /** Owner plan — used to gate Studio-only toggles (ProRes, HDR10, Atmos). */
  plan: "free" | "pro" | "studio" | "family" | undefined;
  /**
   * Atmos cloud minutes consumed this month. Pulled from /api/me/usage.
   * Pair with `atmosMinutesQuota` to render the Studio quota widget when
   * the user selects the `atmos` layout.
   */
  atmosMinutesUsed?: number;
  atmosMinutesQuota?: number;
  onChange: (patch: {
    lutPreset?: LutPreset;
    targetFps?: 24 | 30 | 60;
    masterCodec?: MasterCodec | null;
    colorSpace?: ColorSpace;
    hdrPeakNits?: HdrPeak;
    audioLayout?: AudioLayout;
  }) => void;
  disabled?: boolean;
}

export default function RenderSettingsPanel({
  lutPreset,
  targetFps,
  masterCodec,
  colorSpace,
  hdrPeakNits,
  audioLayout,
  plan,
  atmosMinutesUsed,
  atmosMinutesQuota,
  onChange,
  disabled,
}: Props) {
  const [localLut, setLocalLut] = useState<LutPreset>(lutPreset ?? "none");
  const [localFps, setLocalFps] = useState<24 | 30 | 60>(targetFps ?? 30);
  const [localMaster, setLocalMaster] = useState<MasterOpt>(masterCodec ?? "off");
  const [localColor, setLocalColor] = useState<ColorSpace>(colorSpace ?? "sdr");
  const [localPeak, setLocalPeak] = useState<HdrPeak>(hdrPeakNits ?? 1000);
  const [localAudio, setLocalAudio] = useState<AudioLayout>(audioLayout ?? "stereo");

  const canStudio = plan === "studio" || plan === "family";
  const showPeak = localColor === "hdr10" && canStudio;

  function setLut(id: LutPreset) {
    setLocalLut(id);
    onChange({ lutPreset: id });
  }
  function setFps(id: 24 | 30 | 60) {
    setLocalFps(id);
    onChange({ targetFps: id });
  }
  function setMaster(id: MasterOpt) {
    setLocalMaster(id);
    // "off" is persisted as null to clear the DB field.
    onChange({ masterCodec: id === "off" ? null : id });
  }
  function setColor(id: ColorSpace) {
    setLocalColor(id);
    onChange({ colorSpace: id });
  }
  function setPeak(n: HdrPeak) {
    setLocalPeak(n);
    onChange({ hdrPeakNits: n });
  }
  function setAudio(id: AudioLayout) {
    setLocalAudio(id);
    onChange({ audioLayout: id });
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-flex-muted">
        Paramètres de rendu
      </div>
      <p className="mb-4 text-xs text-flex-muted">
        Appliqués lors du rendu final. Le LUT unifie le look de toutes les scènes ; le framerate
        détermine la fluidité du rendu final.
      </p>

      <div className="mb-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-flex-text">
          Étalonnage (LUT global)
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LUT_OPTIONS.map((o) => {
            const active = localLut === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => setLut(o.id)}
                className={
                  "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition " +
                  (active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent/60 hover:text-flex-text") +
                  (disabled ? " opacity-50 cursor-not-allowed" : "")
                }
                aria-pressed={active}
              >
                <span className="font-semibold">{o.label}</span>
                <span className="text-[10px] leading-snug">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-flex-text">
          Framerate
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {FPS_OPTIONS.map((o) => {
            const active = localFps === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => setFps(o.id)}
                className={
                  "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition " +
                  (active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent/60 hover:text-flex-text") +
                  (disabled ? " opacity-50 cursor-not-allowed" : "")
                }
                aria-pressed={active}
              >
                <span className="font-semibold">{o.label}</span>
                <span className="text-[10px] leading-snug">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-flex-text">
            Master éditorial (Studio)
          </span>
          {!canStudio && (
            <Link
              href="/pricing"
              className="rounded-full border border-flex-accent/40 bg-flex-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-flex-accent transition hover:bg-flex-accent/20"
              title="Passer au plan Studio ou Famille"
            >
              Passer Studio →
            </Link>
          )}
        </div>
        <p className="mb-2 text-[11px] text-flex-muted">
          Export .mov non-compressé en parallèle du rendu streaming. Idéal pour re-montage pro dans
          DaVinci, Premiere, Final Cut. Fichiers volumineux.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["off", "prores", "dnxhr"] as const).map((id) => {
            const active = localMaster === id;
            const disabledBtn = disabled || (!canStudio && id !== "off");
            const label =
              id === "off"
                ? "Aucun (mp4 uniquement)"
                : id === "prores"
                  ? "ProRes 422 HQ"
                  : "DNxHR HQ";
            const hint =
              id === "off"
                ? "Option par défaut"
                : id === "prores"
                  ? "Apple / Final Cut standard"
                  : "Avid / Premiere standard";
            return (
              <button
                key={id}
                type="button"
                disabled={disabledBtn}
                onClick={() => setMaster(id)}
                className={
                  "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition " +
                  (active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent/60 hover:text-flex-text") +
                  (disabledBtn ? " opacity-50 cursor-not-allowed" : "")
                }
                aria-pressed={active}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-[10px] leading-snug">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-flex-text">
            Colorimétrie (HDR)
          </span>
          {!canStudio && (
            <Link
              href="/pricing"
              className="rounded-full border border-flex-accent/40 bg-flex-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-flex-accent transition hover:bg-flex-accent/20"
              title="Passer au plan Studio ou Famille"
            >
              Passer Studio →
            </Link>
          )}
        </div>
        <p className="mb-2 text-[11px] text-flex-muted">
          HDR10 encode en Rec.2020 PQ (10-bit H.265). Rendu compatible Apple TV, Dolby Vision
          displays, YouTube HDR. Cache-streaming SDR conservé via le master .mp4 classique.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["sdr", "hdr10"] as const).map((id) => {
            const active = localColor === id;
            const disabledBtn = disabled || (!canStudio && id === "hdr10");
            const label = id === "sdr" ? "SDR Rec.709" : "HDR10 Rec.2020 PQ";
            const hint =
              id === "sdr" ? "Standard streaming (défaut)" : "HDR10 broadcast + Apple TV";
            return (
              <button
                key={id}
                type="button"
                disabled={disabledBtn}
                onClick={() => setColor(id)}
                className={
                  "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition " +
                  (active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent/60 hover:text-flex-text") +
                  (disabledBtn ? " opacity-50 cursor-not-allowed" : "")
                }
                aria-pressed={active}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-[10px] leading-snug">{hint}</span>
              </button>
            );
          })}
        </div>

        {showPeak && (
          <div className="mt-3 rounded-lg border border-flex-border bg-flex-panel/60 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-flex-text">
              Pic de luminance de masterisation
            </div>
            <div className="grid gap-2 grid-cols-4">
              {([600, 1000, 4000, 10000] as const).map((n) => {
                const active = localPeak === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPeak(n)}
                    className={
                      "rounded-md border px-2 py-1.5 text-center text-[11px] font-semibold transition " +
                      (active
                        ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                        : "border-flex-border bg-flex-card text-flex-muted hover:border-flex-accent/60")
                    }
                    aria-pressed={active}
                  >
                    {n.toLocaleString()} nits
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-flex-muted">
              Pilote les tags MP4 <code>master-display</code> et
              <code> max-cll</code>. 1000 nits = HDR consommateur (iPhone, Apple TV), 4000 =
              référence studio, 10000 = pic Dolby PQ.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-flex-text">
            Audio immersif
          </span>
          {!canStudio && (
            <Link
              href="/pricing"
              className="rounded-full border border-flex-accent/40 bg-flex-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-flex-accent transition hover:bg-flex-accent/20"
              title="Atmos cloud + HOA2 nécessitent Studio"
            >
              Passer Studio →
            </Link>
          )}
        </div>
        <p className="mb-2 text-[11px] text-flex-muted">
          Layout audio du rendu final. « Atmos » utilise le cloud Dolby.io (facturé à la minute,
          Studio+ seulement) ; « Atmos stub » produit du 5.1 E-AC-3 signalé « Atmos compatible »
          sans coût cloud. HOA2 = ambisonic order 2 (9 canaux, VR/AR).
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { id: "stereo", label: "Stéréo", hint: "2.0 AAC (défaut)" },
              { id: "5.1", label: "5.1 AC-3", hint: "Home cinema standard" },
              { id: "7.1", label: "7.1 AAC", hint: "7 + LFE, AAC natif" },
              { id: "ambisonic", label: "Ambisonic B-format", hint: "4ch, YouTube 360" },
              {
                id: "ambisonic-hoa2",
                label: "HOA2 (9 canaux)",
                hint: "AmbiX, VR/AR — Studio",
              },
              {
                id: "ambisonic-hoa3",
                label: "HOA3 (16 canaux)",
                hint: "Vision Pro, Sphere — Studio",
              },
              {
                id: "atmos",
                label: "Dolby Atmos (cloud)",
                hint: "E-AC-3 JOC — Studio",
              },
              {
                id: "atmos-stub",
                label: "Atmos stub (5.1 E-AC-3)",
                hint: "Sans coût cloud",
              },
            ] as const
          ).map((o) => {
            const active = localAudio === o.id;
            const requiresStudio =
              o.id === "atmos" || o.id === "ambisonic-hoa2" || o.id === "ambisonic-hoa3";
            const disabledBtn = disabled || (!canStudio && requiresStudio);
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabledBtn}
                onClick={() => setAudio(o.id)}
                className={
                  "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition " +
                  (active
                    ? "border-flex-accent bg-flex-accent/10 text-flex-text"
                    : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent/60 hover:text-flex-text") +
                  (disabledBtn ? " opacity-50 cursor-not-allowed" : "")
                }
                aria-pressed={active}
              >
                <span className="font-semibold">{o.label}</span>
                <span className="text-[10px] leading-snug">{o.hint}</span>
              </button>
            );
          })}
        </div>

        {localAudio === "atmos" && typeof atmosMinutesQuota === "number" && (
          <div className="mt-3 rounded-lg border border-flex-border bg-flex-panel/60 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-flex-text">
              Quota Atmos mensuel
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-flex-text">
                {atmosMinutesUsed ?? 0} / {atmosMinutesQuota} min
              </span>
              <span className="text-[10px] text-flex-muted">Reset en début de mois</span>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-flex-border"
              role="progressbar"
              aria-valuenow={atmosMinutesUsed ?? 0}
              aria-valuemin={0}
              aria-valuemax={atmosMinutesQuota}
            >
              <div
                className="h-full bg-flex-accent transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    atmosMinutesQuota > 0 ? ((atmosMinutesUsed ?? 0) / atmosMinutesQuota) * 100 : 0
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[10px] text-flex-muted">
              Si le film dépasse ton quota restant, il se rabattra automatiquement sur Atmos stub
              (5.1 E-AC-3 sans coût cloud).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
