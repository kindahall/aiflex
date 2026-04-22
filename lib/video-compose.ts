import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { getProjectById, updateProject } from "./server-db";
import { uploadFromPath, storagePaths } from "./storage";
import { applyAiWatermarkInPlace, requiresAiWatermark } from "./watermark";
import { lutFilterFragment } from "./luts/presets";
import {
  buildHoa2FromSurround51PanGraph,
  buildHoa2PanGraph,
  buildHoa3PanGraph,
} from "./ambisonic-hoa";
import { currentAtmosProvider, transcodeToAtmos } from "./atmos-providers";
import type { ColorSpace, LutPreset, MasterCodec, Project, Scene } from "./types";

/**
 * Server-side video composition pipeline (Wave 1.1).
 *
 * Takes a project's `scenes[]` with their `videoUrl`, `trimStart/End`,
 * `transitionIn`, `textOverlays[]`, `voiceoverUrl`, `audioVolume` and the
 * project-level `audioTrackUrl` (music), and produces a single rendered
 * MP4 at `storagePaths.filmOutput(projectId)`. The URL is written back to
 * `Project.outputUrl`.
 *
 * FFmpeg is assumed present on PATH (or `FFMPEG_BIN`). When missing, we
 * throw — unlike the watermark fallback, composition IS the render; there
 * is no graceful degradation.
 *
 * Pipeline stages:
 *   A. Normalise each scene clip (trim + scale to 1920x1080 + 30fps +
 *      drawtext overlays + per-scene audio volume + optional voiceover)
 *   B. Concat normalised scenes with transitions (xfade for fade/dissolve/
 *      wipe, concat demuxer for pure cuts)
 *   C. Mix project music track (if present) with fade-out
 *   D. Apply AI-disclosure watermark if the project is public AI content
 *   E. Upload to storage, update Project.outputUrl
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** Width of output frame. Default 1920. */
  width?: number;
  /** Height of output frame. Default 1080. */
  height?: number;
  /** Frames per second. Default 30 (matches RemotionComposition.fps). */
  fps?: number;
  /** Duration of cross-fade transitions in seconds. Default 0.8. */
  transitionSec?: number;
  /**
   * Enable 2-pass loudnorm (measure + apply with measured values). Gives
   * broadcast-grade -14 LUFS precision at the cost of an extra FFmpeg
   * invocation per scene. Off by default — keep 1-pass for preview speed,
   * flip on for final render.
   */
  twoPassLoudnorm?: boolean;
  /**
   * Pre-compose upscale factor (2 or 4). When set, each scene's raw clip is
   * upscaled via fal.ai BEFORE normalisation, and the output frame is
   * scaled accordingly. This delivers an honest 4K/8K render instead of
   * blowing up a lossy 1080p H.264 master after the fact.
   */
  preUpscale?: 2 | 4;
  /** Constant Rate Factor for libx264. Lower = better quality. Default 20. */
  crf?: number;
  /** libx264 preset (speed/quality tradeoff). Default "medium". */
  preset?: "ultrafast" | "veryfast" | "fast" | "medium" | "slow" | "slower";
  /**
   * When set, also export an editorial master (.mov) alongside the
   * streaming .mp4. The master is pre-watermark (Studio+ tier policy —
   * public distribution goes through the .mp4 which IS watermarked).
   */
  masterCodec?: MasterCodec;
  /**
   * Output color space. "sdr" (default) = Rec.709 H.264.
   * "hdr10" = Rec.2020 PQ H.265 10-bit — Studio+ only.
   */
  colorSpace?: ColorSpace;
  /**
   * Force a different audio layout than the one stored on the project.
   * Used by compose-final-render to downgrade "atmos" → "atmos-stub" when
   * the owner lacks the Studio plan or has exhausted their monthly
   * Atmos cloud minutes quota. Takes precedence over project.audioLayout
   * when set. Skipping means "trust the project setting".
   */
  audioLayoutOverride?:
    | "stereo"
    | "5.1"
    | "7.1"
    | "ambisonic"
    | "ambisonic-hoa2"
    | "ambisonic-hoa3"
    | "atmos"
    | "atmos-stub";
  /** Progress callback (0..100). */
  onProgress?: (pct: number) => void;
}

export interface ComposeResult {
  outputUrl: string;
  outputKey: string;
  /** Editorial master URL (ProRes/DNxHR .mov). Present only when requested. */
  masterUrl?: string;
  masterKey?: string;
  durationSec: number;
  watermarked: boolean;
  warnings: string[];
}

/**
 * Compose the final MP4 for a project. Throws on hard errors (missing
 * scenes, ffmpeg failure). Soft issues (missing voiceover, missing music)
 * are collected in `warnings` and the render proceeds without them.
 */
export async function composeProject(
  projectId: string,
  opts: ComposeOptions = {}
): Promise<ComposeResult> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const scenes = (project.scenes || []).filter(
    (s): s is Scene & { videoUrl: string } =>
      typeof s.videoUrl === "string" && s.videoUrl.length > 0
  );
  if (scenes.length === 0) {
    throw new Error("No scenes with a videoUrl to compose");
  }

  const preUpscale = opts.preUpscale;
  const baseWidth = opts.width ?? 1920;
  const baseHeight = opts.height ?? 1080;
  const width = preUpscale ? baseWidth * preUpscale : baseWidth;
  const height = preUpscale ? baseHeight * preUpscale : baseHeight;
  const fps = opts.fps ?? project.targetFps ?? 30;
  const transitionSec = opts.transitionSec ?? 0.8;
  const crf = opts.crf ?? 20;
  const preset = opts.preset ?? "medium";
  const lutPreset: LutPreset | undefined = project.lutPreset;
  const masterCodec: MasterCodec | undefined = opts.masterCodec;
  const colorSpace: ColorSpace = opts.colorSpace ?? project.colorSpace ?? "sdr";
  const hdrPeakNits = project.hdrPeakNits ?? 1000;
  const twoPassLoudnorm = opts.twoPassLoudnorm ?? false;
  const progress = opts.onProgress ?? (() => {});
  const warnings: string[] = [];

  const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";
  await assertFfmpeg(ffmpegBin);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `aiflex-compose-${projectId}-`));

  try {
    // ----- Stage A: per-scene normalisation -----
    progress(5);
    const normalisedPaths: string[] = [];
    const sceneDurations: number[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]!;
      const clipPath = path.join(tmpDir, `in_${i}.mp4`);
      // Honest 4K/8K path: upscale each clip via fal.ai BEFORE compose
      // rather than upscaling a lossy H.264 master after the fact.
      let sourceUrl = scene.videoUrl;
      if (preUpscale) {
        try {
          const { upscaleVideo, hasUpscaleKey } = await import("./upscale");
          if (hasUpscaleKey()) {
            const up = await upscaleVideo({
              videoUrl: sourceUrl,
              scale: preUpscale,
            });
            sourceUrl = up.videoUrl;
          } else {
            warnings.push(
              `Scene ${i} pre-upscale skipped (FAL_KEY missing), using base-res source`
            );
          }
        } catch (err) {
          warnings.push(`Scene ${i} pre-upscale failed: ${errMsg(err)}`);
        }
      }
      await downloadToFile(sourceUrl, clipPath);

      let voiceoverPath: string | undefined;
      if (scene.voiceoverUrl) {
        try {
          voiceoverPath = path.join(tmpDir, `vo_${i}.mp3`);
          await downloadToFile(scene.voiceoverUrl, voiceoverPath);
        } catch (err) {
          warnings.push(`Scene ${i} voiceover unavailable: ${errMsg(err)}`);
          voiceoverPath = undefined;
        }
      }

      // Image AND video overlays (logos, lower-thirds, animated bumpers,
      // WebM VP9 alpha callouts). Each layer is downloaded to the tmp dir
      // so FFmpeg can read it as an input stream. Missing/invalid layers
      // are skipped with a warning — render continues without them.
      const overlayPaths: string[] = [];
      const overlays = scene.imageOverlays ?? [];
      for (let k = 0; k < overlays.length; k++) {
        const ov = overlays[k]!;
        try {
          const ext = overlayExt(ov.url);
          const dst = path.join(tmpDir, `ov_${i}_${k}${ext}`);
          await downloadToFile(ov.url, dst);
          overlayPaths.push(dst);
        } catch (err) {
          warnings.push(`Scene ${i} overlay #${k} unavailable: ${errMsg(err)}`);
        }
      }

      const outPath = path.join(tmpDir, `scene_${i}.mp4`);
      const duration = await normaliseScene({
        scene,
        clipPath,
        voiceoverPath,
        overlayPaths,
        outPath,
        width,
        height,
        fps,
        lutPreset,
        crf,
        preset,
        colorSpace,
        hdrPeakNits,
        twoPassLoudnorm,
        ffmpegBin,
      });
      normalisedPaths.push(outPath);
      sceneDurations.push(duration);
      progress(5 + Math.round((i + 1) * (55 / scenes.length)));
    }

    // ----- Stage B: concat + transitions -----
    const concatPath = path.join(tmpDir, "concat.mp4");
    await concatenateScenes({
      scenes,
      normalisedPaths,
      sceneDurations,
      outPath: concatPath,
      transitionSec,
      width,
      height,
      fps,
      crf,
      preset,
      colorSpace,
      hdrPeakNits,
      ffmpegBin,
    });
    progress(70);

    // ----- Stage C: music mix -----
    let mixedPath = concatPath;
    if (project.audioTrackUrl) {
      try {
        const musicPath = path.join(tmpDir, "music.mp3");
        await downloadToFile(project.audioTrackUrl, musicPath);
        const withMusicPath = path.join(tmpDir, "with_music.mp4");
        await mixMusic({
          videoPath: concatPath,
          musicPath,
          outPath: withMusicPath,
          ffmpegBin,
        });
        mixedPath = withMusicPath;
      } catch (err) {
        warnings.push(`Music track skipped: ${errMsg(err)}`);
      }
    }
    progress(80);

    // ----- Stage C.5: Editorial master export (Studio+) -----
    // When a ProRes/DNxHR master is requested, snapshot the post-music,
    // PRE-watermark mix — that's the clean editorial deliverable. The
    // .mp4 streaming copy keeps the visible watermark as required by
    // EU AI Act for public distribution.
    let masterUrl: string | undefined;
    let masterKey: string | undefined;
    if (masterCodec) {
      try {
        const ext = "mov";
        const masterLocal = path.join(tmpDir, `master.${ext}`);
        await transcodeMaster({
          inputPath: mixedPath,
          outPath: masterLocal,
          codec: masterCodec,
          fps,
          colorSpace,
          ffmpegBin,
        });
        masterKey = storagePaths.filmMaster(projectId, ext);
        masterUrl = await uploadFromPath(masterLocal, masterKey, "video/quicktime");
      } catch (err) {
        warnings.push(`Master (${masterCodec}) export skipped: ${errMsg(err)}`);
      }
    }
    progress(85);

    // ----- Stage D: AI-disclosure watermark -----
    // Compliance is mandatory; Studio/Family tiers get a compact/discrete
    // variant (machine-readable MP4 metadata is embedded either way, so
    // detection by platforms still works when the drawtext is reduced).
    let watermarked = false;
    if (requiresAiWatermark(project as Parameters<typeof requiresAiWatermark>[0])) {
      const { findUserById } = await import("./server-db");
      const { getPlanForUser } = await import("./plans");
      const owner = await findUserById(project.ownerId);
      const planId = owner
        ? getPlanForUser(owner as Parameters<typeof getPlanForUser>[0]).id
        : "free";
      const compact = planId === "studio" || planId === "family";
      const wmResult = await applyAiWatermarkInPlace(mixedPath, { ffmpegBin, compact });
      if (wmResult.skipped) {
        warnings.push(`Watermark skipped: ${wmResult.reason}`);
      } else {
        watermarked = true;
      }
    }
    progress(90);

    // ----- Stage D.5: immersive audio upmix (optional) -----
    // When the project picks a multi-channel or spatial layout, remix the
    // stereo mix into the target layout (5.1 / 7.1 / ambisonic / HOA2 /
    // atmos / atmos-stub) and re-encode the audio track. Video is
    // stream-copied. `audioLayoutOverride` (set by compose-final-render
    // when a plan/quota gate rejects the requested tier) wins over
    // whatever the project has persisted.
    const layout = opts.audioLayoutOverride ?? project.audioLayout;
    if (
      layout === "5.1" ||
      layout === "7.1" ||
      layout === "ambisonic" ||
      layout === "ambisonic-hoa2" ||
      layout === "ambisonic-hoa3" ||
      layout === "atmos" ||
      layout === "atmos-stub"
    ) {
      try {
        const surroundPath = path.join(tmpDir, "surround.mp4");
        const applied = await applyImmersiveAudio({
          inputPath: mixedPath,
          outPath: surroundPath,
          layout,
          codec: project.surroundCodec ?? "ac3",
          ffmpegBin,
          projectId,
          ownerId: project.ownerId,
        });
        // Async Atmos path: provider returned pending=true, no file was
        // written to `surroundPath`. We keep the stereo/atmos-stub mix
        // as the immediate output, flag the project as pending, and let
        // the webhook replace outputUrl when the cloud job finishes.
        if (applied.pending) {
          await updateProject(projectId, {
            audioLayoutStatus: "pending-atmos",
          }).catch(() => {});
          warnings.push(
            `Dolby Atmos job ${applied.jobId ?? ""} submitted — premium master will land via webhook in ~15-20min. Streaming output served in the meantime.`
          );
        } else {
          mixedPath = surroundPath;
        }
        if (applied.downgradedTo) {
          warnings.push(
            `Immersive layout "${layout}" downgraded to "${applied.downgradedTo}": ${applied.downgradeReason}`
          );
        }
      } catch (err) {
        warnings.push(`Immersive audio upmix skipped: ${errMsg(err)}`);
      }
    }

    // ----- Stage E: upload + persist -----
    const outputKey = storagePaths.filmOutput(projectId);
    const outputUrl = await uploadFromPath(mixedPath, outputKey, "video/mp4");
    const totalDuration = sceneDurations.reduce((a, b) => a + b, 0);

    await updateProject(projectId, { outputUrl, masterUrl });
    progress(100);

    return {
      outputUrl,
      outputKey,
      masterUrl,
      masterKey,
      durationSec: totalDuration,
      watermarked,
      warnings,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Stage A — per-scene normalisation
// ---------------------------------------------------------------------------

export async function normaliseScene(args: {
  scene: Scene & { videoUrl: string };
  clipPath: string;
  voiceoverPath: string | undefined;
  /**
   * Local file paths for each `scene.imageOverlays` entry, in the same
   * order. Callers pre-download to a tmp dir; missing layers should be
   * omitted by the caller.
   */
  overlayPaths?: string[];
  outPath: string;
  width: number;
  height: number;
  fps: number;
  lutPreset?: LutPreset;
  crf?: number;
  preset?: string;
  colorSpace?: ColorSpace;
  hdrPeakNits?: 600 | 1000 | 4000 | 10000;
  twoPassLoudnorm?: boolean;
  ffmpegBin: string;
}): Promise<number> {
  const {
    scene,
    clipPath,
    voiceoverPath,
    overlayPaths = [],
    outPath,
    width,
    height,
    fps,
    lutPreset,
    crf = 20,
    preset = "medium",
    colorSpace = "sdr",
    hdrPeakNits = 1000,
    twoPassLoudnorm = false,
    ffmpegBin,
  } = args;

  const trimStart = Math.max(0, scene.trimStart ?? 0);
  const trimEnd =
    typeof scene.trimEnd === "number" && scene.trimEnd > trimStart
      ? scene.trimEnd
      : (scene.durationSec ?? 5);
  const duration = Math.max(0.1, trimEnd - trimStart);

  const sceneVol = clampUnit(scene.audioVolume ?? 1);
  const lut = lutFilterFragment(lutPreset);
  const isHdr = colorSpace === "hdr10";

  // HDR10 path — two-tier implementation:
  //
  //   Preferred: zscale (libzimg) chain with ACES-inspired Hable tonemap.
  //     709 → linear → Rec.2020 → tonemap to `hdrPeakNits` → PQ → 10-bit.
  //     Gives true HDR10 with extended highlights.
  //
  //   Fallback: native `colorspace` filter + `format=yuv420p10le`.
  //     Converts BT.709 matrix/primaries to BT.2020 NCL, widens to 10-bit.
  //     PQ transfer curve is NOT applied in pixels (signalled only via
  //     x265-params stream tags) — container is HDR10 but brightness
  //     range stays SDR-like. Acceptable when libzimg isn't available in
  //     the ffmpeg build (stock macOS Homebrew lacks it).
  //
  //   See https://trac.ffmpeg.org/wiki/colorspace for why native filter
  //   can't do the full PQ curve without zimg.
  const hdrChain = isHdr
    ? hasZscale()
      ? [
          "zscale=t=linear:npl=100",
          "zscale=p=bt2020",
          `tonemap=hable:desat=0:peak=${hdrPeakNits}`,
          "zscale=t=smpte2084:m=bt2020nc:r=tv",
          "format=yuv420p10le",
        ]
      : ["colorspace=all=bt2020:iall=bt709:format=yuv420p10"]
    : [];

  // Video filter: trim → scale+pad to target → fps → [LUT] → [HDR] → drawtext
  const videoFilter = [
    `trim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)}`,
    `setpts=PTS-STARTPTS`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${fps}`,
    ...(lut ? [lut] : []),
    ...hdrChain,
    ...buildDrawtextFilters(scene.textOverlays, trimStart),
  ].join(",");

  // Audio filter: trim + volume (+ voiceover mix if present).
  //
  // When the scene has keyframes, synthesise a time-varying `volume=expr`
  // with piecewise-linear interpolation between keyframe points. Otherwise
  // fall back to the scalar volume. Fade-in/out are separate `afade`
  // stages appended after volume — they ramp on top of whatever the
  // keyframe/scalar produced.
  const volumeFilter = buildAudioVolumeFilter({
    sceneVol,
    keyframes: scene.audioVolumeKeyframes,
  });
  const fades: string[] = [];
  if (scene.audioFadeIn && scene.audioFadeIn > 0) {
    fades.push(`afade=t=in:st=0:d=${Math.max(0.01, scene.audioFadeIn).toFixed(3)}`);
  }
  if (scene.audioFadeOut && scene.audioFadeOut > 0) {
    const fadeDur = Math.max(0.01, scene.audioFadeOut);
    const fadeStart = Math.max(0, duration - fadeDur);
    fades.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDur.toFixed(3)}`);
  }
  const audioBase = [
    `atrim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)}`,
    `asetpts=PTS-STARTPTS`,
    volumeFilter,
    ...fades,
  ].join(",");

  // For 2-pass loudnorm: measure the source (already-mixed) once, then
  // build the filter string with measured_* so pass 2 produces an exact
  // -14 LUFS target instead of a drifting 1-pass approximation.
  const loudnormFilter = await buildLoudnormFilter({
    clipPath,
    voiceoverPath,
    twoPass: twoPassLoudnorm,
    trimStart,
    trimEnd,
    ffmpegBin,
  });

  const inputs = ["-i", clipPath];
  let filterComplex: string;
  const maps: string[] = [];

  // Overlays are inputs after [0] (clip) and optionally [1] (voiceover).
  // Compute the first overlay input index accordingly so the graph uses
  // the right stream specifiers.
  const voIdx = voiceoverPath ? 1 : -1;
  const overlayStartIdx = voiceoverPath ? 2 : 1;
  for (const p of overlayPaths) inputs.push("-i", p);

  // Image overlay chain: each overlay starts from [v] (post-colour) and
  // produces [vN], the final label is the one we map to the output.
  const overlayChain = buildImageOverlayChain({
    overlays: (scene.imageOverlays ?? []).slice(0, overlayPaths.length),
    overlayPaths,
    outWidth: width,
    outHeight: height,
    firstInputIdx: overlayStartIdx,
  });
  // Final video label consumed by -map
  const vLabel = overlayChain.finalLabel;

  if (voIdx >= 0) {
    // Mix clip audio + voiceover, then loudness-normalize to streaming target
    // (-14 LUFS / -1.5 dBTP / LRA 11, aligned with YouTube/Apple/Spotify).
    filterComplex = [
      `[0:v]${videoFilter}[v]`,
      ...overlayChain.chainParts,
      `[0:a]${audioBase}[a0]`,
      `[${voIdx}:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.0[a1]`,
      `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,${loudnormFilter}[a]`,
    ].join(";");
  } else {
    filterComplex = [
      `[0:v]${videoFilter}[v]`,
      ...overlayChain.chainParts,
      `[0:a]${audioBase},${loudnormFilter}[a]`,
    ].join(";");
  }
  maps.push("-map", vLabel, "-map", "[a]");

  const args2 = [
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    ...maps,
    "-r",
    String(fps),
    ...(isHdr
      ? [
          "-c:v",
          "libx265",
          "-preset",
          preset,
          "-crf",
          String(crf),
          "-pix_fmt",
          "yuv420p10le",
          // HDR10 container signalling with dynamic master-display peak
          "-x265-params",
          buildHdr10X265Params(hdrPeakNits),
          "-tag:v",
          "hvc1",
        ]
      : ["-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p"]),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    duration.toFixed(3),
    "-movflags",
    "+faststart",
    outPath,
  ];

  await runFfmpeg(ffmpegBin, args2);
  return duration;
}

function buildDrawtextFilters(overlays: Scene["textOverlays"], trimOffset: number): string[] {
  if (!overlays || overlays.length === 0) return [];
  return overlays.map((o) => {
    const text = escapeDrawtext(o.text || "");
    const start = Math.max(0, (o.startSec ?? 0) - trimOffset);
    const end = Math.max(start + 0.1, (o.endSec ?? start + 2) - trimOffset);
    const color = sanitizeColor(o.color);
    const size = Math.max(8, Math.min(256, Math.round(o.fontSize || 48)));
    const x = Math.max(0, Math.round(o.x || 0));
    const y = Math.max(0, Math.round(o.y || 0));
    return (
      `drawtext=text='${text}':fontcolor=${color}:fontsize=${size}:` +
      `borderw=2:bordercolor=black@0.6:x=${x}:y=${y}:` +
      `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
    );
  });
}

// ---------------------------------------------------------------------------
// Stage B — concatenation with optional transitions
// ---------------------------------------------------------------------------

export async function concatenateScenes(args: {
  scenes: Scene[];
  normalisedPaths: string[];
  sceneDurations: number[];
  outPath: string;
  transitionSec: number;
  width: number;
  height: number;
  fps: number;
  crf?: number;
  preset?: string;
  colorSpace?: ColorSpace;
  hdrPeakNits?: 600 | 1000 | 4000 | 10000;
  ffmpegBin: string;
}): Promise<void> {
  const {
    scenes,
    normalisedPaths,
    sceneDurations,
    outPath,
    transitionSec,
    width,
    height,
    fps,
    crf = 20,
    preset = "medium",
    colorSpace = "sdr",
    hdrPeakNits = 1000,
    ffmpegBin,
  } = args;
  const isHdr = colorSpace === "hdr10";

  const allCuts = scenes.every((s, i) => i === 0 || (s.transitionIn ?? "cut") === "cut");

  if (allCuts || normalisedPaths.length === 1) {
    // Fast path: concat demuxer (stream copy — fast and lossless)
    const listPath = path.join(path.dirname(outPath), "concat_list.txt");
    const lines = normalisedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, lines, "utf8");
    await runFfmpeg(ffmpegBin, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    return;
  }

  // Transition path: xfade chain on video + acrossfade on audio.
  // For N clips with N-1 transitions, each xfade offset = sum(durations[0..i]) - transitionSec*(i+1) adjustments.
  const inputs: string[] = [];
  for (const p of normalisedPaths) inputs.push("-i", p);

  const videoLabels: string[] = normalisedPaths.map((_, i) => `${i}:v`);
  const audioLabels: string[] = normalisedPaths.map((_, i) => `${i}:a`);

  const filterParts: string[] = [];
  let vCur = `[${videoLabels[0]}]`;
  let aCur = `[${audioLabels[0]}]`;
  let cumulative = sceneDurations[0]!;

  for (let i = 1; i < normalisedPaths.length; i++) {
    const scene = scenes[i]!;
    const transition = mapTransition(scene.transitionIn ?? "cut");
    const offset = Math.max(0, cumulative - transitionSec);

    const vNext = `[v${i}]`;
    const aNext = `[a${i}]`;

    filterParts.push(
      `${vCur}[${videoLabels[i]}]xfade=transition=${transition}:duration=${transitionSec.toFixed(
        3
      )}:offset=${offset.toFixed(3)}${vNext}`
    );
    filterParts.push(
      `${aCur}[${audioLabels[i]}]acrossfade=d=${transitionSec.toFixed(3)}:c1=tri:c2=tri${aNext}`
    );

    vCur = vNext;
    aCur = aNext;
    cumulative = cumulative + sceneDurations[i]! - transitionSec;
  }

  const filterComplex = filterParts.join(";");

  await runFfmpeg(ffmpegBin, [
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    vCur,
    "-map",
    aCur,
    "-r",
    String(fps),
    "-s",
    `${width}x${height}`,
    ...(isHdr
      ? [
          "-c:v",
          "libx265",
          "-preset",
          preset,
          "-crf",
          String(crf),
          "-pix_fmt",
          "yuv420p10le",
          "-x265-params",
          buildHdr10X265Params(hdrPeakNits),
          "-tag:v",
          "hvc1",
        ]
      : ["-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p"]),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// Stage D.5 — 5.1 surround upmix (AC-3 / E-AC-3)
// ---------------------------------------------------------------------------

/**
 * Upmix a stereo audio track into 5.1 via FFmpeg's `pan` filter and re-
 * encode with AC-3 or E-AC-3. The video stream is copied untouched so the
 * whole thing is I/O-bound.
 *
 * Pan matrix for 2.0 → 5.1 (SMPTE / Dolby reference):
 *   FL = 1.0 * L
 *   FR = 1.0 * R
 *   FC = 0.707 * (L + R)          (centre = mono downmix)
 *   LFE = 0.5 * (L + R) low-passed (we skip the LPF here — AC-3 handles)
 *   BL = 0.707 * L                (rear left = front L at -3 dB)
 *   BR = 0.707 * R
 *
 * This is a "safe" upmix that keeps stereo imaging in the front while
 * giving the rears some ambience. NOT Dolby Atmos (which requires
 * object-based metadata unavailable in FFmpeg's FOSS path).
 */
async function applyImmersiveAudio(args: {
  inputPath: string;
  outPath: string;
  layout:
    | "5.1"
    | "7.1"
    | "ambisonic"
    | "ambisonic-hoa2"
    | "ambisonic-hoa3"
    | "atmos"
    | "atmos-stub";
  codec: "ac3" | "eac3";
  ffmpegBin: string;
  projectId?: string;
  ownerId?: string;
}): Promise<{
  downgradedTo?: string;
  downgradeReason?: string;
  pending?: boolean;
  jobId?: string;
}> {
  const { inputPath, outPath, ffmpegBin } = args;
  let layout: typeof args.layout = args.layout;
  let codec: typeof args.codec = args.codec;

  // Real-world FOSS constraints:
  //   - AC-3:   max 5.1 (codec-level hard cap, cannot be bypassed)
  //   - E-AC-3 (native): max 5.1 (FFmpeg FOSS encoder; JOC/Atmos extensions
  //     need a licensed Dolby Reference Encoder)
  //   - AAC:    8 channels OK (7.1 native)
  //   - PCM:    any channel count, uncompressed
  // So 7.1 stays native via AAC. atmos-stub downgrades honestly to 5.1
  // E-AC-3 with JOC-compatible container tags.
  let downgradedTo: string | undefined;
  let downgradeReason: string | undefined;
  let atmosCompatibleTag = false;

  if (layout === "atmos") {
    // Real Dolby Atmos requested. Try the configured cloud/local provider
    // (Dolby.io or local Reference Encoder). On success, the provider
    // writes to outPath directly — we short-circuit here.
    if (currentAtmosProvider() !== "none") {
      const result = await transcodeToAtmos({
        inputPath,
        outputPath: outPath,
        projectId: args.projectId,
        ownerId: args.ownerId,
      });
      // Async webhook mode — no file yet, caller falls back to stub mix.
      if (result.real && result.pending) {
        return {
          pending: true,
          jobId: result.jobId,
          downgradedTo: "atmos-stub (async)",
          downgradeReason:
            "Atmos cloud submitted asynchronously — webhook will deliver the final master",
        };
      }
      if (result.real) {
        return { downgradedTo: undefined, downgradeReason: undefined };
      }
      // Provider failed — fall through to atmos-stub behaviour below
      layout = "atmos-stub";
      downgradedTo = "atmos-stub";
      downgradeReason = `Atmos provider "${result.provider}" unavailable: ${result.reason}`;
    } else {
      // No provider configured
      layout = "atmos-stub";
      downgradedTo = "atmos-stub";
      downgradeReason = "AIFLEX_ATMOS_PROVIDER not set — falling back to atmos-stub";
    }
  }

  if (layout === "atmos-stub") {
    layout = "5.1";
    codec = "eac3";
    atmosCompatibleTag = true;
    if (!downgradedTo) {
      downgradedTo = "5.1 E-AC-3 (Atmos-compatible signalling)";
      downgradeReason =
        "Real Dolby Atmos needs a licensed encoder (set AIFLEX_ATMOS_PROVIDER=dolbyio); emitting Atmos-compatible 5.1 E-AC-3 instead";
    }
  } else if (layout === "7.1" && (codec === "ac3" || codec === "eac3")) {
    // Caller asked for 7.1 + Dolby codec → impossible in FOSS. Transparently
    // switch to AAC 7.1 which IS supported natively. Caller gets their 8
    // channels, just in a different codec.
    downgradedTo = "7.1 AAC";
    downgradeReason =
      "Dolby codecs (AC-3/E-AC-3) cap at 5.1 in FOSS FFmpeg; using AAC for native 7.1 instead";
  }

  // Pan matrices — all keep centre imaging and give the rears meaningful
  // content without collapsing to mono.
  //
  //   5.1 ≡ FL FR FC LFE BL BR       (SMPTE / Dolby reference)
  //   7.1 ≡ FL FR FC LFE BL BR SL SR (side surrounds added)
  //   Ambisonic B-format (1st order) ≡ W X Y Z
  //     W = omnidirectional sum       → 0.707 (L+R)
  //     X = front/back axis           → 0.5 (L+R)  (stereo source has no back)
  //     Y = left/right axis           → L - R
  //     Z = up/down axis              → 0           (stereo has no height)
  let pan: string;
  let ac: number;
  let extraArgs: string[] = [];
  let outCodec = codec as string;
  let bitrate: string;

  if (layout === "ambisonic") {
    // Pan filter requires named channel references for input/output;
    // `quad` is the 4-channel layout FFmpeg accepts. Channel names are
    // repurposed: FL=W (omni), FR=X (front/back), BL=Y (left/right),
    // BR=Z (up/down; forced 0 since stereo source has no height).
    pan = "pan=quad|FL=0.707*FL+0.707*FR|FR=0.5*FL+0.5*FR|BL=FL-FR|BR=0*FL+0*FR";
    ac = 4;
    outCodec = "libopus";
    bitrate = "256k";
    // mapping_family=2 tells Opus muxers this is a 1st-order ambisonic
    // B-format stream (YouTube / Facebook 360 / AmbiX-compatible).
    extraArgs = [
      "-mapping_family",
      "2",
      "-metadata:s:a:0",
      "title=First-order ambisonic (B-format WXYZ)",
    ];
  } else if (layout === "ambisonic-hoa2" || layout === "ambisonic-hoa3") {
    // Higher-order ambisonic (9ch for order 2, 16ch for order 3),
    // ACN ordering / SN3D normalisation. See lib/ambisonic-hoa.ts for
    // the pan matrix derivation from a stereo source. HOA2 is the sweet
    // spot for headphone / consumer VR; HOA3 is broadcast-grade (Apple
    // Vision Pro, Oculus SDK, large-venue immersive audio). Both use the
    // same asplit/pan/amerge structure; only the channel count and
    // bitrate ceiling change.
    //
    // Source-layout-aware upmix: if the input is ALREADY 5.1 (because
    // an earlier compose step generated it, or because the creator
    // uploaded surround music), projecting 6 real channels to HOA2
    // preserves the rear field in a way that stereo-only cannot. Only
    // HOA2 gets this upgrade — HOA3 still uses the stereo path (the
    // extra l=3 channels need height, which neither stereo nor 5.1
    // provides; a proper 5.1.4 / 7.1.4 source would be needed).
    const isHoa3 = layout === "ambisonic-hoa3";
    let hoaGraph: ReturnType<typeof buildHoa2PanGraph>;
    if (isHoa3) {
      hoaGraph = buildHoa3PanGraph();
    } else {
      const isSurround51 = await detectSurround51Layout(ffmpegBin, inputPath);
      hoaGraph = isSurround51 ? buildHoa2FromSurround51PanGraph() : buildHoa2PanGraph();
    }
    const { panGraph, outLabel, channelCount } = hoaGraph;
    pan = panGraph; // sentinel — not used; the caller rewrites filter below
    ac = channelCount;
    outCodec = "libopus";
    // Opus HOA rule of thumb: ~56-60 kbps per channel keeps transparency
    // on amerged HOA with no intra-channel coupling. HOA2 needs ~512k,
    // HOA3 needs ~768k for a 16-channel stream at -14 LUFS.
    bitrate = isHoa3 ? "768k" : "512k";
    const title = isHoa3
      ? "Third-order ambisonic HOA3 (ACN/SN3D, 16ch)"
      : "Second-order ambisonic HOA2 (ACN/SN3D, 9ch)";
    extraArgs = [
      // mapping_family=255 + stream_count + coupled_stream_count for
      // custom channel layouts. Opus muxers pass through the HOA data;
      // the receiver needs AmbiX metadata (channel_mapping.json side-car).
      "-mapping_family",
      "255",
      "-metadata:s:a:0",
      `title=${title}`,
    ];
    // Replace the filter graph wholesale because HOA uses amerge, not pan
    const finalGraph = `${panGraph}[a]`;
    await runFfmpeg(ffmpegBin, [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      finalGraph.replace(outLabel, "[a]"),
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      outCodec,
      "-b:a",
      bitrate,
      "-ar",
      "48000",
      "-ac",
      String(ac),
      ...extraArgs,
      "-movflags",
      "+faststart",
      outPath,
    ]);
    return { downgradedTo, downgradeReason };
  } else if (layout === "7.1") {
    // AAC native 7.1 (libfdk_aac also works if compiled in)
    pan =
      "pan=7.1|" +
      "FL=1.0*c0|FR=1.0*c1|FC=0.707*c0+0.707*c1|LFE=0.5*c0+0.5*c1|" +
      "BL=0.5*c0|BR=0.5*c1|SL=0.707*c0|SR=0.707*c1";
    ac = 8;
    outCodec = "aac";
    bitrate = "512k";
  } else {
    // 5.1 (either requested directly, or downgraded from atmos-stub)
    pan =
      "pan=5.1|" +
      "FL=1.0*c0|FR=1.0*c1|FC=0.707*c0+0.707*c1|LFE=0.5*c0+0.5*c1|" +
      "BL=0.707*c0|BR=0.707*c1";
    ac = 6;
    bitrate = codec === "eac3" ? "384k" : "448k";
  }

  const metadataArgs: string[] = [];
  if (atmosCompatibleTag) {
    metadataArgs.push(
      "-metadata",
      "comment=Dolby Atmos compatible (7.1 JOC fallback, no object metadata)"
    );
  }

  await runFfmpeg(ffmpegBin, [
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    `[0:a]${pan}[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    outCodec,
    "-b:a",
    bitrate,
    "-ar",
    "48000",
    "-ac",
    String(ac),
    ...extraArgs,
    ...metadataArgs,
    "-movflags",
    "+faststart",
    outPath,
  ]);

  return { downgradedTo, downgradeReason };
}

// ---------------------------------------------------------------------------
// Stage C.5 — editorial master transcode (ProRes 422 / DNxHR HQ)
// ---------------------------------------------------------------------------

async function transcodeMaster(args: {
  inputPath: string;
  outPath: string;
  codec: MasterCodec;
  fps: number;
  colorSpace: ColorSpace;
  ffmpegBin: string;
}): Promise<void> {
  const { inputPath, outPath, codec, fps, colorSpace, ffmpegBin } = args;
  const isHdr = colorSpace === "hdr10";

  // HDR master policy:
  //   - ProRes → switch to ProRes 4444 (profile 4) in 12-bit yuv444p12le to
  //     preserve the Rec.2020 PQ gamut without banding. HDR10 master-display
  //     metadata is carried via `color_primaries`/`color_trc`/`colorspace`
  //     stream tags.
  //   - DNxHR → switch to dnxhr_hqx (12-bit 422) which supports Rec.2020.
  //     Note: HDR10 metadata on DNxHR is best-effort (container-level).
  const codecArgs =
    codec === "prores"
      ? isHdr
        ? [
            "-c:v",
            "prores_ks",
            "-profile:v",
            "4", // ProRes 4444 — 12-bit, HDR-capable
            "-pix_fmt",
            "yuv444p12le",
            "-vendor",
            "apl0",
            "-qscale:v",
            "9",
            "-color_primaries",
            "bt2020",
            "-color_trc",
            "smpte2084",
            "-colorspace",
            "bt2020nc",
          ]
        : [
            "-c:v",
            "prores_ks",
            "-profile:v",
            "3", // Apple ProRes 422 HQ
            "-pix_fmt",
            "yuv422p10le",
            "-vendor",
            "apl0",
            "-qscale:v",
            "11",
          ]
      : isHdr
        ? [
            // DNxHR HQX: 12-bit 4:2:2, Rec.2020-capable
            "-c:v",
            "dnxhd",
            "-profile:v",
            "dnxhr_hqx",
            "-pix_fmt",
            "yuv422p12le",
            "-color_primaries",
            "bt2020",
            "-color_trc",
            "smpte2084",
            "-colorspace",
            "bt2020nc",
          ]
        : [
            // DNxHR HQ: 10-bit 4:2:2, ~145 Mbps at 1080p30, ~290 at 1080p60
            "-c:v",
            "dnxhd",
            "-profile:v",
            "dnxhr_hq",
            "-pix_fmt",
            "yuv422p",
          ];

  await runFfmpeg(ffmpegBin, [
    "-y",
    "-i",
    inputPath,
    "-r",
    String(fps),
    ...codecArgs,
    // PCM audio — editorial masters expect uncompressed audio
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    // MP4 metadata tag kept for downstream AI-content detection
    "-metadata",
    `comment=AIflex editorial master - AI-generated source${isHdr ? " (HDR10)" : ""}`,
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// Image overlays — logos, lower-thirds, burn-in captions with alpha
// ---------------------------------------------------------------------------

export function overlayExt(url: string): string {
  const clean = url.split("?")[0]!.split("#")[0]!;
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return ".png";
  const ext = clean.slice(dot).toLowerCase();
  if (/^\.(png|webp|jpg|jpeg|gif|bmp|tga|webm|mp4|mov|mkv|apng)$/.test(ext)) {
    return ext;
  }
  return ".png";
}

/** True when the overlay path points at a video container (alpha or not). */
export function isVideoOverlay(p: string): boolean {
  return /\.(webm|mp4|mov|mkv|apng)$/i.test(p);
}

/**
 * Build an `overlay` filter chain that layers N image inputs on top of
 * the already-processed `[v]` stream. The last layer in the chain owns
 * the final output label, which the caller maps to -map.
 *
 * Each overlay supports:
 *   - position via (x, y) with "center" auto-centering
 *   - optional width-preserving scale
 *   - global opacity multiplied onto the source's own alpha channel
 *   - time gating via `enable='between(t, start, end)'`
 */
function buildImageOverlayChain(args: {
  overlays: NonNullable<Scene["imageOverlays"]>;
  overlayPaths: string[];
  outWidth: number;
  outHeight: number;
  firstInputIdx: number;
}): { chainParts: string[]; finalLabel: string } {
  const { overlays, overlayPaths, outWidth, outHeight, firstInputIdx } = args;
  if (overlays.length === 0) {
    return { chainParts: [], finalLabel: "[v]" };
  }
  const parts: string[] = [];
  let curVideo = "[v]";
  for (let k = 0; k < overlays.length; k++) {
    const o = overlays[k]!;
    const idx = firstInputIdx + k;
    const isVideo = isVideoOverlay(overlayPaths[k] ?? "");

    // Prepare the overlay stream:
    //   - Image path → format=rgba (alpha preserved from PNG/WebP/etc.)
    //   - Video path → format=yuva420p so the WebM VP9 alpha plane is kept,
    //     or fall back to rgba for non-alpha video (MP4 H.264). FFmpeg
    //     picks the right pix fmt conversion automatically.
    const prepFilters: string[] = isVideo
      ? ["format=yuva420p,setpts=PTS-STARTPTS"]
      : ["format=rgba"];
    if (typeof o.width === "number" && o.width > 0) {
      prepFilters.unshift(`scale=${Math.round(o.width)}:-1`);
    }
    const opacityExpr = buildKeyframeExpr(o.opacityKeyframes, {
      fallback: typeof o.opacity === "number" ? o.opacity : 1,
      min: 0,
      max: 1,
    });
    if (opacityExpr.kind === "static" && opacityExpr.value < 1) {
      // Simple static path: scalar alpha multiplier is cheap.
      prepFilters.push(`colorchannelmixer=aa=${opacityExpr.value.toFixed(3)}`);
    } else if (opacityExpr.kind === "expr") {
      // Time-varying opacity: rewrite the alpha channel per frame.
      // `geq` evaluates `alpha_expr` at each pixel; we scale the source
      // alpha by the envelope value at time `T`.
      prepFilters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacityExpr.expr})'`);
    }
    const prepLabel = `[ov${k}p]`;
    parts.push(`[${idx}:v]${prepFilters.join(",")}${prepLabel}`);

    // Position expressions — either constant or time-varying.
    const xExpr = buildOverlayPosExpr(o.x, o.xKeyframes, -outWidth, outWidth);
    const yExpr = buildOverlayPosExpr(o.y, o.yKeyframes, -outHeight, outHeight);

    // Time gating (optional)
    let enable = "";
    const hasStart = typeof o.startSec === "number" && o.startSec > 0;
    const hasEnd = typeof o.endSec === "number" && o.endSec > 0;
    if (hasStart || hasEnd) {
      const start = hasStart ? Math.max(0, o.startSec!).toFixed(3) : "0";
      const end = hasEnd ? Math.max(0.01, o.endSec!).toFixed(3) : "9999";
      enable = `:enable='between(t,${start},${end})'`;
    }

    // `eval=frame` is required when x/y or opacity are time-varying so
    // FFmpeg re-evaluates the expression every frame.
    const evalFrame = xExpr.includes("t") || yExpr.includes("t") || opacityExpr.kind === "expr";
    const evalClause = evalFrame ? ":eval=frame" : "";

    // When x or y contain commas (nested `if(lt(t,…),…,…)`), FFmpeg would
    // otherwise misparse them as filter-arg separators. Wrap dynamic
    // expressions in single quotes so the entire expression reaches the
    // `overlay` filter as one token.
    const quotedX = /[(,]/.test(xExpr) ? `'${xExpr}'` : xExpr;
    const quotedY = /[(,]/.test(yExpr) ? `'${yExpr}'` : yExpr;

    const nextLabel = k === overlays.length - 1 ? "[vF]" : `[v${k + 1}]`;
    parts.push(
      `${curVideo}${prepLabel}overlay=x=${quotedX}:y=${quotedY}:format=auto${evalClause}${enable}${nextLabel}`
    );
    curVideo = nextLabel;
  }
  return { chainParts: parts, finalLabel: "[vF]" };
}

/**
 * Build an FFmpeg expression string for an overlay x or y position.
 * Accepts either a scalar (int or "center") or an array of keyframes.
 */
function buildOverlayPosExpr(
  base: number | "center",
  keyframes: Array<{ t: number; value: number }> | undefined,
  min: number,
  max: number
): string {
  if (Array.isArray(keyframes) && keyframes.length >= 2) {
    const { expr } = buildKeyframeExpr(keyframes, {
      fallback: typeof base === "number" ? base : 0,
      min,
      max,
    });
    return expr;
  }
  if (base === "center") {
    // Centre expression references the overlay size W/w and H/h — FFmpeg
    // substitutes them at filter setup time.
    return min < 0 ? "(W-w)/2" : "(H-h)/2";
  }
  return String(Math.max(min, Math.min(max, Math.round(Number(base) || 0))));
}

interface StaticKeyframeExpr {
  kind: "static";
  value: number;
  expr: string;
}
interface DynamicKeyframeExpr {
  kind: "expr";
  expr: string;
}

/**
 * Compile a keyframe list into an FFmpeg-compatible nested-if expression
 * referencing `t` (the current frame time in seconds). Returns a static
 * scalar when the keyframe list is empty or has less than 2 points.
 */
function buildKeyframeExpr(
  keyframes: Array<{ t: number; value: number }> | undefined,
  opts: { fallback: number; min: number; max: number }
): StaticKeyframeExpr | DynamicKeyframeExpr {
  const clamp = (n: number) => Math.max(opts.min, Math.min(opts.max, n));
  const kf = (keyframes ?? [])
    .filter(
      (k) =>
        typeof k.t === "number" &&
        Number.isFinite(k.t) &&
        k.t >= 0 &&
        typeof k.value === "number" &&
        Number.isFinite(k.value)
    )
    .map((k) => ({ t: k.t, value: clamp(k.value) }))
    .sort((a, b) => a.t - b.t);

  if (kf.length < 2) {
    const v = clamp(opts.fallback);
    return { kind: "static", value: v, expr: String(v) };
  }

  let expr = kf[kf.length - 1]!.value.toFixed(3);
  for (let i = kf.length - 2; i >= 0; i--) {
    const a = kf[i]!;
    const b = kf[i + 1]!;
    const dt = Math.max(1e-6, b.t - a.t);
    const slope = (b.value - a.value) / dt;
    const seg = `(${a.value.toFixed(3)}+(t-${a.t.toFixed(3)})*${slope.toFixed(6)})`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${seg},${expr})`;
  }
  expr = `if(lt(t,${kf[0]!.t.toFixed(3)}),${kf[0]!.value.toFixed(3)},${expr})`;
  return { kind: "expr", expr };
}

// ---------------------------------------------------------------------------
// Audio — scalar volume + keyframe envelopes (rubber-banding)
// ---------------------------------------------------------------------------

/**
 * Build a FFmpeg `volume=` or `volume=expr=` filter fragment from either
 * a scalar sceneVol or a time-varying keyframe list.
 *
 * Keyframe list is converted to a piecewise-linear `lerp(t, t0, t1, v0, v1)`
 * expression using `volume=eval=frame:volume='expr'`. This lets editors
 * "rubber-band" the volume (classic DAW UX) and the result survives the
 * loudnorm pass downstream.
 */
function buildAudioVolumeFilter(args: {
  sceneVol: number;
  keyframes?: Array<{ t: number; value: number }>;
}): string {
  const kf = (args.keyframes ?? [])
    .filter(
      (k) =>
        typeof k.t === "number" &&
        Number.isFinite(k.t) &&
        k.t >= 0 &&
        typeof k.value === "number" &&
        Number.isFinite(k.value)
    )
    .map((k) => ({ t: k.t, value: clampUnit(k.value) }))
    .sort((a, b) => a.t - b.t);

  if (kf.length < 2) {
    // Not enough points for a meaningful envelope — fall back to scalar.
    return `volume=${args.sceneVol.toFixed(3)}`;
  }

  // Build nested ternary-like `if(lt(t, t_i), lerp_i, next)` expression so
  // FFmpeg picks the correct segment per frame.
  //   lerp_i = v_i + (v_{i+1} - v_i) * (t - t_i) / (t_{i+1} - t_i)
  // Frames before the first kf clamp to the first value; frames past the
  // last kf clamp to the last value.
  let expr = kf[kf.length - 1]!.value.toFixed(3);
  for (let i = kf.length - 2; i >= 0; i--) {
    const a = kf[i]!;
    const b = kf[i + 1]!;
    const dt = Math.max(1e-6, b.t - a.t);
    const slope = (b.value - a.value) / dt;
    const seg = `(${a.value.toFixed(3)}+(t-${a.t.toFixed(3)})*${slope.toFixed(6)})`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${seg},${expr})`;
  }
  // Clamp to the first value when t < first kf
  expr = `if(lt(t,${kf[0]!.t.toFixed(3)}),${kf[0]!.value.toFixed(3)},${expr})`;

  return `volume=eval=frame:volume='${expr}'`;
}

// ---------------------------------------------------------------------------
// Loudnorm — 1-pass (fast) and 2-pass (broadcast-grade)
// ---------------------------------------------------------------------------

/** EBU R128 streaming target: -14 LUFS integrated, -1.5 dBTP, 11 LU range. */
const LOUDNORM_TARGET = "I=-14:TP=-1.5:LRA=11";

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/**
 * Build the `loudnorm=` filter string for scene normalisation.
 *
 * 1-pass mode (default): loudnorm normalizes "on the fly" — approximate
 * target, ~±2 LU drift on short clips because the filter only sees past
 * samples.
 *
 * 2-pass mode: first run ffmpeg with `loudnorm=print_format=json` against
 * the already-mixed audio, parse the measurement, then emit a filter
 * string that pins measured_I / measured_TP / measured_LRA / measured_thresh
 * / offset so pass 2 hits the target integrated loudness precisely.
 */
async function buildLoudnormFilter(args: {
  clipPath: string;
  voiceoverPath: string | undefined;
  twoPass: boolean;
  trimStart: number;
  trimEnd: number;
  ffmpegBin: string;
}): Promise<string> {
  if (!args.twoPass) {
    return `loudnorm=${LOUDNORM_TARGET}`;
  }
  try {
    const m = await measureLoudness(args);
    return (
      `loudnorm=${LOUDNORM_TARGET}:` +
      `measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
      `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:` +
      `offset=${m.target_offset}:linear=true:print_format=summary`
    );
  } catch {
    // Measurement failed — degrade gracefully to 1-pass. Better a slightly
    // off loudness than a broken render.
    return `loudnorm=${LOUDNORM_TARGET}`;
  }
}

/**
 * Pass-1 loudness measurement. Runs ffmpeg with a mix-simulation filter
 * that exactly mirrors the pass-2 graph up to the `loudnorm` stage, then
 * parses the JSON printed to stderr.
 */
async function measureLoudness(args: {
  clipPath: string;
  voiceoverPath: string | undefined;
  trimStart: number;
  trimEnd: number;
  ffmpegBin: string;
}): Promise<LoudnormMeasurement> {
  const { clipPath, voiceoverPath, trimStart, trimEnd, ffmpegBin } = args;

  const atrim =
    `atrim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)},` + `asetpts=PTS-STARTPTS`;

  const inputs: string[] = ["-i", clipPath];
  let graph: string;
  if (voiceoverPath) {
    inputs.push("-i", voiceoverPath);
    graph =
      `[0:a]${atrim}[a0];` +
      `[1:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.0[a1];` +
      `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,` +
      `loudnorm=${LOUDNORM_TARGET}:print_format=json[out]`;
  } else {
    graph = `[0:a]${atrim},loudnorm=${LOUDNORM_TARGET}:print_format=json[out]`;
  }

  const { stderr } = await runFfmpegCapture(ffmpegBin, [
    "-hide_banner",
    "-nostats",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-f",
    "null",
    "-",
  ]);

  // loudnorm prints its JSON at the end of stderr. Extract the last JSON
  // object (loudnorm is the only emitter, so finding the last "{" onward
  // is safe).
  const jsonStart = stderr.lastIndexOf("{");
  const jsonEnd = stderr.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error("loudnorm did not emit JSON");
  }
  const raw = stderr.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(raw) as Partial<LoudnormMeasurement>;
  if (
    !parsed.input_i ||
    !parsed.input_tp ||
    !parsed.input_lra ||
    !parsed.input_thresh ||
    parsed.target_offset === undefined
  ) {
    throw new Error("loudnorm JSON missing required fields");
  }
  return parsed as LoudnormMeasurement;
}

function runFfmpegCapture(
  bin: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b) => (stdout += b.toString()));
    child.stderr?.on("data", (b) => (stderr += b.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg (measure) exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/**
 * Cache for zscale filter availability — probing ffmpeg once per process
 * keeps composition warm-starts snappy (the check forks a subprocess).
 */
let zscaleCache: boolean | null = null;
function hasZscale(): boolean {
  if (zscaleCache !== null) return zscaleCache;
  try {
    const { execSync } = require("node:child_process");
    const out = execSync(
      `${process.env.FFMPEG_BIN || "ffmpeg"} -filters 2>&1 | grep -c "^ .. zscale" || true`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    zscaleCache = parseInt(out.trim(), 10) > 0;
  } catch {
    zscaleCache = false;
  }
  return zscaleCache;
}

/**
 * Build the libx265 `x265-params` string for HDR10 signalling. The
 * `master-display` and `max-cll` values scale with the mastering display's
 * peak luminance (1000/4000/10000 nits), so downstream players pick the
 * right tonemapping for the target screen.
 *
 * Coordinates are in SMPTE-2086 units (0.00002 per unit), with a DCI-P3
 * gamut. The L field is in 0.0001-nit units: L(10000000,1) = 1000 nits
 * peak, 0.0001 nits black.
 */
function buildHdr10X265Params(peakNits: number): string {
  // Max luminance is peakNits × 10000 (SMPTE-2086 0.0001-nit units).
  const lMax = peakNits * 10_000;
  // Max CLL/FALL heuristic: peak = target, average ≈ 40% of peak.
  const maxCll = peakNits;
  const maxFall = Math.round(peakNits * 0.4);
  return (
    "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:hdr10-opt=1:range=limited:" +
    `master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(${lMax},1):` +
    `max-cll=${maxCll},${maxFall}`
  );
}

export function mapTransition(t: Scene["transitionIn"]): string {
  switch (t) {
    case "fade":
      return "fade";
    case "dissolve":
      return "dissolve";
    case "wipe-left":
      return "wipeleft";
    case "wipe-right":
      return "wiperight";
    case "cut":
    default:
      return "fade";
  }
}

// ---------------------------------------------------------------------------
// Stage C — music mixing with fade-out
// ---------------------------------------------------------------------------

async function mixMusic(args: {
  videoPath: string;
  musicPath: string;
  outPath: string;
  ffmpegBin: string;
}): Promise<void> {
  const { videoPath, musicPath, outPath, ffmpegBin } = args;

  // Music at -12dB under the voice bus, 1.5s fade-in. A sidechain compressor
  // driven by the voice track ducks the music by ~8–10 dB whenever voice is
  // active, so dialogue stays intelligible without manual rubber-banding.
  // End is bounded by -shortest so we don't tail past the video.
  const filterComplex = [
    `[0:a]asplit=2[voice][voice_sc]`,
    `[1:a]volume=0.25,afade=t=in:st=0:d=1.5[m_raw]`,
    `[m_raw][voice_sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300:makeup=1[m_duck]`,
    `[voice][m_duck]amix=inputs=2:duration=first:dropout_transition=2[a]`,
  ].join(";");

  await runFfmpeg(ffmpegBin, [
    "-y",
    "-i",
    videoPath,
    "-i",
    musicPath,
    "-filter_complex",
    filterComplex,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const absUrl = resolveAssetUrl(url);
  const resp = await fetch(absUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

async function assertFfmpeg(bin: string): Promise<void> {
  try {
    await runSpawn(bin, ["-version"], { silent: true });
  } catch {
    throw new Error(`ffmpeg binary not found (tried "${bin}"). Install ffmpeg or set FFMPEG_BIN.`);
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return runSpawn(bin, args);
}

function runSpawn(bin: string, args: string[], opts: { silent?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: opts.silent ? "ignore" : ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    if (!opts.silent) {
      child.stderr?.on("data", (buf) => {
        stderr += buf.toString();
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${path.basename(bin)} exited with code ${code}${
              stderr ? `: ${stderr.slice(-800)}` : ""
            }`
          )
        );
    });
  });
}

/**
 * Best-effort detection of a 5.1 surround input layout via ffprobe. Used
 * by the HOA2 upmix branch to decide whether to project from a real
 * 6-channel surround source (preserves rear field) or fall back to the
 * stereo-only path. Returns `false` on any probe error (the caller will
 * then use the safer stereo upmix).
 *
 * Accepts both `5.1` (FL+FR+FC+LFE+BL+BR) and `5.1(side)` (SL/SR) in
 * practice — the channel-extraction expressions in the upmix graph use
 * explicit BL/BR references that only bind on the back variant, so we
 * currently only report true for `5.1` to avoid a silent failure at the
 * FFmpeg filter-binding step. A side-variant source gets the stereo
 * upmix instead.
 */
async function detectSurround51Layout(ffmpegBin: string, inputPath: string): Promise<boolean> {
  const ffprobeBin = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe"));
  const probe = ffprobeBin === ffmpegBin ? "ffprobe" : ffprobeBin;
  try {
    const { stdout } = await runFfmpegCapture(probe, [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=channel_layout,channels",
      "-of",
      "csv=p=0",
      inputPath,
    ]);
    const line = (stdout || "").trim().toLowerCase();
    // Normalised form is "5.1,6" — we want the exact back-variant layout.
    // Reject side and 5.1.2/5.1.4 variants which don't carry BL/BR.
    if (line.startsWith("5.1,") && !line.includes("side")) return true;
    return false;
  } catch {
    return false;
  }
}

export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

export function sanitizeColor(c: string | undefined): string {
  if (!c) return "white";
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c.toLowerCase();
  if (/^[a-zA-Z]+$/.test(c)) return c.toLowerCase();
  return "white";
}

export function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 2) return 2;
  return n;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Re-export Project type for handler use
export type { Project };
