import "server-only";

/**
 * Higher-order ambisonic (HOA) channel remapping for AIflex.
 *
 * Mission: take a stereo (2.0) source and project it onto a 2nd-order
 * ambisonic basis (9 channels, ACN ordering, SN3D normalisation — the
 * AmbiX convention). The output stream, muxed through Opus with
 * `mapping_family=255`, is readable by AmbiX-compatible players (IEM
 * Plugin Suite, Google Resonance Audio, WebXR audio graph, Unity
 * Wwise spatial audio).
 *
 * Why HOA2 matters: first-order ambisonic (4 channels) gives "general
 * direction" but its sweet spot is small (~head-width). HOA2 triples
 * the spatial resolution and is the sweet spot for VR/AR audio at a
 * reasonable bitrate. HOA3 (16 channels) is broadcast-grade; out of
 * scope here.
 *
 * Math reference: spherical harmonics real basis, SN3D normalisation.
 * See https://en.wikipedia.org/wiki/Ambisonic_data_exchange_formats
 *
 * Stereo → HOA2 projection:
 *   We place L at azimuth +30°, R at -30°, both at elevation 0°.
 *   Y_lm(az, el) values at el=0:
 *     Y00  = 1                       (W)
 *     Y1-1 = sin(az)                 (Y)
 *     Y10  = 0                       (Z, elevation sin → 0)
 *     Y11  = cos(az)                 (X)
 *     Y2-2 = 0.866 * sin(2·az)       (V)
 *     Y2-1 = 0                       (T, el=0)
 *     Y20  = -0.5                    (R, el=0 ⇒ constant)
 *     Y21  = 0                       (S, el=0)
 *     Y22  = 0.866 * cos(2·az)       (U)
 *
 * Each output ACN channel is the SUM over sources of source × Y_lm(θ).
 */

const DEG = Math.PI / 180;
const AZ_L = 30 * DEG;
const AZ_R = -30 * DEG;

/**
 * Return the 9 SN3D-normalised spherical-harmonic coefficients for a
 * point source at (azimuth, elevation=0). ACN ordering.
 */
export function hoa2Coefficients(azRad: number): number[] {
  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);
  const sin2Az = Math.sin(2 * azRad);
  const cos2Az = Math.cos(2 * azRad);
  // SN3D uses no extra (2l+1)^{1/2} factor (that's N3D). Here we apply
  // the mild cardinal boost for l=2 via sqrt(3)/2 ≈ 0.866025.
  const k2 = Math.sqrt(3) / 2;
  return [
    1.0, // ACN 0 : W     (l=0, m= 0)
    sinAz, // ACN 1 : Y     (l=1, m=-1)
    0.0, // ACN 2 : Z     (l=1, m= 0)  el=0 → 0
    cosAz, // ACN 3 : X     (l=1, m= 1)
    k2 * sin2Az, // ACN 4 : V     (l=2, m=-2)
    0.0, // ACN 5 : T     (l=2, m=-1)  el=0 → 0
    -0.5, // ACN 6 : R     (l=2, m= 0)  el=0 → -1/2
    0.0, // ACN 7 : S     (l=2, m= 1)  el=0 → 0
    k2 * cos2Az, // ACN 8 : U     (l=2, m= 2)
  ];
}

/**
 * Build the 9 per-channel FFmpeg `pan` node expressions that project a
 * stereo source onto 2nd-order ambisonic. Each output is a linear
 * combination of FL and FR, weighted by the SH coefficient at the
 * virtual source direction (+/-30° azimuth).
 *
 * Returns a filter graph using `asplit`, per-channel `pan`, and a final
 * `amerge` into a 9-channel stream.
 */
export function buildHoa2PanGraph(): {
  panGraph: string;
  outLabel: string;
  channelCount: number;
} {
  const cL = hoa2Coefficients(AZ_L);
  const cR = hoa2Coefficients(AZ_R);

  // For each of the 9 output channels, weights are [cL[i] for L, cR[i] for R].
  // FFmpeg `pan=mono|c0=a*FL+b*FR` outputs a single-channel stream.
  // We split the source into 9 copies then pan each into one mono track,
  // then amerge all 9 back into a multichannel stream.
  const splitPorts = Array.from({ length: 9 }, (_, i) => `[hoa${i}]`).join("");
  const parts: string[] = [`[0:a]asplit=9${splitPorts}`];
  for (let i = 0; i < 9; i++) {
    const a = cL[i]!.toFixed(6);
    const b = cR[i]!.toFixed(6);
    parts.push(`[hoa${i}]pan=mono|c0=${a}*FL+${b}*FR[ch${i}]`);
  }
  const mergePorts = Array.from({ length: 9 }, (_, i) => `[ch${i}]`).join("");
  parts.push(`${mergePorts}amerge=inputs=9[hoaOut]`);

  return {
    panGraph: parts.join(";"),
    outLabel: "[hoaOut]",
    channelCount: 9,
  };
}

// ---------------------------------------------------------------------------
// HOA order 3 — 16 channels (ACN 0..15), SN3D normalised
// ---------------------------------------------------------------------------
//
// Why HOA3 matters: the 16-channel AmbiX format is the broadcast-grade
// spatial audio used for Apple Vision Pro ("Spatial Audio with Dynamic
// Head Tracking"), Oculus Audio SDK, the Sphere Las Vegas audio system,
// and Meta's VR video ingest. First-order (4ch) and second-order (9ch)
// are good for headphones; third-order is where large-venue immersive
// audio and room-scale VR start to sound accurate.
//
// SN3D real spherical harmonics at (az, el):
//   Y_l^m(az, el)   (ACN index = l² + l + m)
//
// Using the Daniel 2003 convention for ambisonic, azimuth counter-
// clockwise from front (+X), elevation from horizon (+Z up):
//
// l=3 coefficients (SN3D) at general (az, el):
//   ACN  9 (3,-3) : √(5/8) · sin(3az) · cos³(el)
//   ACN 10 (3,-2) : (√15/2) · sin(2az) · cos²(el) · sin(el)
//   ACN 11 (3,-1) : √(3/8) · sin(az) · cos(el) · (5 sin²(el) - 1)
//   ACN 12 (3, 0) : (1/2) · sin(el) · (5 sin²(el) - 3)
//   ACN 13 (3, 1) : √(3/8) · cos(az) · cos(el) · (5 sin²(el) - 1)
//   ACN 14 (3, 2) : (√15/2) · cos(2az) · cos²(el) · sin(el)
//   ACN 15 (3, 3) : √(5/8) · cos(3az) · cos³(el)
//
// SN3D (Schmidt semi-normalised) is the AmbiX convention; it omits the
// extra √(2l+1) factor that would turn these into N3D (orthonormal) —
// that extra factor is compensated on the decoder side, keeping the
// inter-order gain balanced without it.
const K3_3 = Math.sqrt(5 / 8); // ≈ 0.790569
const K3_2 = Math.sqrt(15) / 2; // ≈ 1.936491
const K3_1 = Math.sqrt(3 / 8); // ≈ 0.612372

/**
 * Return the 16 SN3D-normalised spherical-harmonic coefficients (ACN
 * ordering) for a point source at (azimuth, elevation). Use this for
 * HOA3 panning where either the source has a non-zero elevation or the
 * tests need to verify behaviour outside the horizontal plane.
 *
 * The first 9 entries match `hoa2Coefficients(az)` when el=0, and
 * generalise to arbitrary elevation via the cos(el)/sin(el) terms.
 */
export function hoa3Coefficients(azRad: number, elRad = 0): number[] {
  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);
  const sin2Az = Math.sin(2 * azRad);
  const cos2Az = Math.cos(2 * azRad);
  const sin3Az = Math.sin(3 * azRad);
  const cos3Az = Math.cos(3 * azRad);
  const sinEl = Math.sin(elRad);
  const cosEl = Math.cos(elRad);
  const sinElSq = sinEl * sinEl;
  const cosElSq = cosEl * cosEl;
  const cosElCube = cosElSq * cosEl;
  const k2 = Math.sqrt(3) / 2;

  return [
    // --- l=0 ---
    1.0, // ACN 0  (W)
    // --- l=1 ---
    sinAz * cosEl, // ACN 1  (Y, l=1 m=-1)
    sinEl, // ACN 2  (Z, l=1 m= 0)
    cosAz * cosEl, // ACN 3  (X, l=1 m= 1)
    // --- l=2 ---
    k2 * sin2Az * cosElSq, // ACN 4  (V, l=2 m=-2)
    Math.sqrt(3) * sinAz * sinEl * cosEl, // ACN 5  (T, l=2 m=-1)
    0.5 * (3 * sinElSq - 1), // ACN 6  (R, l=2 m= 0)
    Math.sqrt(3) * cosAz * sinEl * cosEl, // ACN 7  (S, l=2 m= 1)
    k2 * cos2Az * cosElSq, // ACN 8  (U, l=2 m= 2)
    // --- l=3 ---
    K3_3 * sin3Az * cosElCube, // ACN 9  (l=3 m=-3)
    K3_2 * sin2Az * cosElSq * sinEl, // ACN 10 (l=3 m=-2)
    K3_1 * sinAz * cosEl * (5 * sinElSq - 1), // ACN 11 (l=3 m=-1)
    0.5 * sinEl * (5 * sinElSq - 3), // ACN 12 (l=3 m= 0)
    K3_1 * cosAz * cosEl * (5 * sinElSq - 1), // ACN 13 (l=3 m= 1)
    K3_2 * cos2Az * cosElSq * sinEl, // ACN 14 (l=3 m= 2)
    K3_3 * cos3Az * cosElCube, // ACN 15 (l=3 m= 3)
  ];
}

// ---------------------------------------------------------------------------
// HOA2 upmix from 5.1 surround — better than stereo because the source
// already carries rear + centre info; we don't have to synthesise them.
// ---------------------------------------------------------------------------
//
// Standard 5.1 channel labels / canonical positions (ITU-R BS.775):
//   FL  : front-left         → az +30°
//   FR  : front-right        → az -30°
//   FC  : front-centre       → az  0°
//   LFE : low-frequency      → omni (W only, no directional info)
//   BL  : back/surround-left → az +110°
//   BR  : back/surround-right→ az -110°
//
// For each of the 9 HOA2 output ACN channels, the weight applied to an
// input channel is the SH coefficient at that channel's azimuth (el=0).
// LFE is routed to W (ACN 0) at 0.707 — a modest attenuation to avoid
// bass pile-up since LFE is already mixed +10 dB hot in 5.1.

const AZ_FL = 30 * DEG;
const AZ_FR = -30 * DEG;
const AZ_FC = 0;
const AZ_BL = 110 * DEG;
const AZ_BR = -110 * DEG;
const LFE_W_GAIN = 0.707;

/**
 * Per-input-channel coefficient vectors for 5.1 → HOA2 projection.
 * Exported so unit tests can verify the canonical values without
 * re-deriving them.
 */
export function surround51ToHoa2Coefficients(): {
  FL: number[];
  FR: number[];
  FC: number[];
  LFE: number[];
  BL: number[];
  BR: number[];
} {
  const lfe = [LFE_W_GAIN, 0, 0, 0, 0, 0, 0, 0, 0];
  return {
    FL: hoa2Coefficients(AZ_FL),
    FR: hoa2Coefficients(AZ_FR),
    FC: hoa2Coefficients(AZ_FC),
    LFE: lfe,
    BL: hoa2Coefficients(AZ_BL),
    BR: hoa2Coefficients(AZ_BR),
  };
}

/**
 * Build the 9-channel FFmpeg filter graph that projects a 5.1 source
 * onto 2nd-order ambisonic. Same asplit/pan/amerge shape as the stereo
 * variant, but each of the 9 `pan` nodes sums all 6 input-channel
 * contributions weighted by the SH coefficient at that channel's
 * canonical azimuth.
 *
 * Input layout: expects an FFmpeg 5.1 stream (FL+FR+FC+LFE+BL+BR). If
 * your source is 5.1(side) (uses SL/SR instead of BL/BR), convert with
 * `aformat=channel_layouts=5.1` first — the rear vs. side positions are
 * very close for SH projection purposes (~70° vs. 110°), but the
 * explicit BL/BR references in this graph will otherwise fail to bind.
 */
export function buildHoa2FromSurround51PanGraph(): {
  panGraph: string;
  outLabel: string;
  channelCount: number;
} {
  const c = surround51ToHoa2Coefficients();
  const splitPorts = Array.from({ length: 9 }, (_, i) => `[hoa${i}]`).join("");
  const parts: string[] = [`[0:a]asplit=9${splitPorts}`];
  for (let i = 0; i < 9; i++) {
    const terms = [
      `${c.FL[i]!.toFixed(6)}*FL`,
      `${c.FR[i]!.toFixed(6)}*FR`,
      `${c.FC[i]!.toFixed(6)}*FC`,
      `${c.LFE[i]!.toFixed(6)}*LFE`,
      `${c.BL[i]!.toFixed(6)}*BL`,
      `${c.BR[i]!.toFixed(6)}*BR`,
    ];
    parts.push(`[hoa${i}]pan=mono|c0=${terms.join("+")}[ch${i}]`);
  }
  const mergePorts = Array.from({ length: 9 }, (_, i) => `[ch${i}]`).join("");
  parts.push(`${mergePorts}amerge=inputs=9[hoaOut]`);

  return {
    panGraph: parts.join(";"),
    outLabel: "[hoaOut]",
    channelCount: 9,
  };
}

// ---------------------------------------------------------------------------
// HOA mixing graphs — amix + acrossfade for multi-source composition
// ---------------------------------------------------------------------------
//
// `buildHoa2PanGraph` covers the single-stereo-source upmix case. When
// the compose pipeline eventually needs to *mix* two pre-existing HOA2
// sources (e.g. an ambient bed + a voiceover projected to HOA2, or a
// crossfade between two ambisonic scenes), `amerge` is the wrong tool:
// it concatenates channel lists of its inputs into one stream (input A
// channel 0..8 then input B channel 0..8 = 18 channels total), not a
// proper mixdown. For same-channel-count multichannel summing, `amix`
// is the correct filter — it sums corresponding channels at the
// specified weights. Likewise, `acrossfade` honours channel_layouts
// across non-standard counts only when we drive it through an
// aformat/channel_layout filter first.

/**
 * Build an FFmpeg filter graph that sums N HOA2 sources channel-by-
 * channel using `amix`. Each input must already be a 9-channel HOA2
 * stream (ACN/SN3D). The output is a single 9-channel HOA2 stream.
 *
 * Why `amix` (not `amerge`): `amerge` stacks channels (9+9 = 18);
 * `amix` sums them (9+9 = 9, averaged/weighted). For ambisonic beds
 * that need to coexist in the same sound field, we want summing.
 *
 * @param sources — number of HOA2 streams to mix. Must be >= 1.
 * @param weights — optional per-source gain; defaults to 1.0 for all.
 *   Pass e.g. [1.0, 0.5] to keep source 0 at unity and halve source 1.
 */
export function buildHoa2MixGraph(
  sources: number,
  weights?: number[]
): {
  panGraph: string;
  outLabel: string;
  channelCount: number;
} {
  if (!Number.isInteger(sources) || sources < 1) {
    throw new Error(`buildHoa2MixGraph: sources must be >= 1, got ${sources}`);
  }
  if (weights && weights.length !== sources) {
    throw new Error(
      `buildHoa2MixGraph: weights length (${weights.length}) must match sources (${sources})`
    );
  }
  const inputPorts = Array.from({ length: sources }, (_, i) => `[${i}:a]`).join("");
  const weightList =
    weights && weights.length > 0
      ? ` :weights='${weights.map((w) => w.toFixed(6)).join(" ")}'`
      : "";
  const graph = `${inputPorts}amix=inputs=${sources}:duration=longest:normalize=0${weightList}[hoaMixOut]`;
  return {
    panGraph: graph,
    outLabel: "[hoaMixOut]",
    channelCount: 9,
  };
}

/**
 * Build an FFmpeg filter graph that temporally crossfades two HOA2 clips
 * using `acrossfade`. The filter itself operates per-channel, so when
 * both inputs advertise the same 9-channel layout it "just works" and
 * preserves the HOA field. Callers are expected to force the layout on
 * both inputs to a named 9-channel identifier (`9.0`) since acrossfade
 * rejects streams with mismatched channel layouts.
 *
 * @param durationSec — length of the crossfade in seconds.
 * @param curve — EBU R.128 cross-fade curve (default "tri" = linear).
 */
export function concatHoa2Clips(
  durationSec: number,
  curve: "tri" | "qsin" | "esin" | "hsin" | "log" | "ipar" | "qua" | "cub" | "squ" | "cbr" = "tri"
): {
  panGraph: string;
  outLabel: string;
  channelCount: number;
} {
  if (!(durationSec > 0)) {
    throw new Error(`concatHoa2Clips: durationSec must be > 0, got ${durationSec}`);
  }
  // aformat forces both inputs to a well-known 9.0 layout so acrossfade
  // accepts them without "channel layouts are not the same" errors when
  // the source muxers label the streams as "9 channels" without a named
  // layout. acrossfade then cross-fades per channel, preserving the
  // ambisonic field.
  const parts = [
    `[0:a]aformat=channel_layouts=9.0[a0]`,
    `[1:a]aformat=channel_layouts=9.0[a1]`,
    `[a0][a1]acrossfade=d=${durationSec.toFixed(3)}:c1=${curve}:c2=${curve}[hoaXOut]`,
  ];
  return {
    panGraph: parts.join(";"),
    outLabel: "[hoaXOut]",
    channelCount: 9,
  };
}

/**
 * Build the 16-channel FFmpeg filter graph that projects a stereo source
 * onto 3rd-order ambisonic (ACN/SN3D). Same asplit/pan/amerge structure
 * as HOA2, just 16 channels wide. The virtual stereo source stays at
 * ±30° azimuth, elevation 0 — consistent with the HOA1/HOA2 path, so a
 * downstream decoder rendering to a head-tracked binaural output keeps
 * the front-stage imaging coherent across orders.
 */
export function buildHoa3PanGraph(): {
  panGraph: string;
  outLabel: string;
  channelCount: number;
} {
  const cL = hoa3Coefficients(AZ_L, 0);
  const cR = hoa3Coefficients(AZ_R, 0);

  const splitPorts = Array.from({ length: 16 }, (_, i) => `[hoa${i}]`).join("");
  const parts: string[] = [`[0:a]asplit=16${splitPorts}`];
  for (let i = 0; i < 16; i++) {
    const a = cL[i]!.toFixed(6);
    const b = cR[i]!.toFixed(6);
    parts.push(`[hoa${i}]pan=mono|c0=${a}*FL+${b}*FR[ch${i}]`);
  }
  const mergePorts = Array.from({ length: 16 }, (_, i) => `[ch${i}]`).join("");
  parts.push(`${mergePorts}amerge=inputs=16[hoaOut]`);

  return {
    panGraph: parts.join(";"),
    outLabel: "[hoaOut]",
    channelCount: 16,
  };
}
