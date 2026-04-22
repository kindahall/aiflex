export type Genre =
  | "sci-fi"
  | "fantasy"
  | "thriller"
  | "romance"
  | "horror"
  | "drama"
  | "comedy"
  | "action"
  | "documentary"
  | "anime"
  | "noir"
  | "western";

export type Format =
  | "long-metrage"
  | "mini-serie"
  | "court-metrage"
  | "clip"
  | "trailer"
  | "anime-episode"
  | "documentaire";

export type Tone =
  | "epique"
  | "sombre"
  | "onirique"
  | "comique"
  | "tendu"
  | "intime"
  | "apocalyptique"
  | "nostalgique";

export type ProjectStage =
  | "idea"
  | "concept"
  | "scenario"
  | "scenes"
  | "visuals"
  | "assembly"
  | "published";

/** Global color grading presets applied at compose time (via FFmpeg lut3d). */
export type LutPreset =
  | "none"
  | "cinema"
  | "noir"
  | "teal-orange"
  | "desat"
  | "warm"
  // ACES-inspired looks (RRT + ODT hand-baked into a 3D LUT, approx).
  // Good for "give it an ACES vibe" without the infra. 17³ resolution.
  | "aces-rec709"
  | "aces-rec2020"
  | "aces-pq1000"
  // True ACES 2.0 transforms — baked via OpenColorIO's `ociobakelut` from
  // the official Academy studio-config, 33³ resolution. Matches Resolve /
  // Fusion / Nuke ACES 2.0 output pixel-for-pixel.
  | "aces-v2-rec709-true"
  | "aces-v2-p3-true"
  | "aces-v2-pq1000-true"
  | "aces-v2-pq4000-true";

/** Master codec for editorial export (Studio+ tier). */
export type MasterCodec = "prores" | "dnxhr";

/**
 * Colorspace of the final render.
 * - "sdr": Rec.709 SDR, H.264 yuv420p — default, YouTube/TikTok/broadcast.
 * - "hdr10": Rec.2020 PQ HDR10, H.265 yuv420p10le — Apple TV, HDR-capable
 *   streaming. Requires HDR10 metadata in the MP4 container.
 */
export type ColorSpace = "sdr" | "hdr10";

export interface Character {
  name: string;
  role: string;
  description: string;
  arc?: string;
}

export interface Concept {
  title: string;
  logline: string;
  synopsis: string;
  themes: string[];
  tone: string;
  universe: string;
  characters: Character[];
  targetAudience: string;
}

export interface Scenario {
  acts: Array<{
    number: number;
    title: string;
    summary: string;
    beats: string[];
  }>;
  fullOutline: string;
}

export interface Scene {
  id: string;
  index: number;
  title: string;
  location: string;
  timeOfDay: string;
  characters: string[];
  action: string;
  dialogue: string;
  mood: string;
  visualPrompt: string;
  durationSec: number;
  imageUrl?: string;
  imageStatus?: "idle" | "pending" | "ready" | "error";
  imageError?: string;
  imagePrompt?: string;
  imageModel?: string;
  imageSeed?: number;
  videoUrl?: string;
  videoStatus?: "idle" | "pending" | "ready" | "error";
  videoError?: string;
  // --- Per-scene generation controls (editable in studio) ---
  aspectRatio?: "16:9" | "9:16" | "1:1" | "2:3" | "3:2";
  motionIntensity?: "slow" | "normal" | "fast";
  negativePrompt?: string;
  /** Generation mode for this scene. */
  generationMode?: "text-to-video" | "image-to-video" | "video-to-video" | "text-to-image";
  /** Reference image URL for image-to-video mode. */
  referenceImageUrl?: string;
  /** Source video URL for video-to-video mode (Luma Reframe). */
  sourceVideoUrl?: string;
  /** Camera control instructions (bracket or descriptive). */
  cameraControl?: string;
  /** Resolution override. */
  resolution?: string;
  /** Seed for reproducible generation. */
  seed?: number;
  /** Enable prompt optimizer (Hailuo). */
  usePromptOptimizer?: boolean;
  // --- Voiceover (TTS) ---
  voiceoverUrl?: string;
  voiceoverStatus?: "idle" | "pending" | "ready" | "error";
  voiceoverText?: string;
  voiceoverVoice?: string;
  /**
   * Audio track returned natively by the video model (Veo 3). When set,
   * the compose step skips the TTS + lip-sync stage and muxes this audio
   * directly alongside the video — Google's synced-native-audio pass is
   * more aligned with the generated mouth movements than any post-hoc
   * lip-sync we could apply.
   */
  nativeAudioUrl?: string;
  /** Timed subtitle entries for this scene. */
  subtitles?: SubtitleEntry[];
  // --- Video editor fields ---
  trimStart?: number;
  trimEnd?: number;
  transitionIn?: "cut" | "fade" | "dissolve" | "wipe-left" | "wipe-right";
  audioVolume?: number;
  /**
   * Fade-in duration (seconds) for the scene audio. Applied as an
   * `afade=t=in` ramp from silence to the scene's `audioVolume` level.
   */
  audioFadeIn?: number;
  /**
   * Fade-out duration (seconds) for the scene audio. Applied as an
   * `afade=t=out` ramp to silence at the end of the trimmed region.
   */
  audioFadeOut?: number;
  /**
   * Explicit audio volume keyframes for a scene. Each entry is
   * `{ t: secondsFromTrimStart, value: 0..2 }`. Converted to an FFmpeg
   * `volume=expr` time-varying filter at compose time. When set, overrides
   * the simple audioVolume scalar.
   */
  audioVolumeKeyframes?: Array<{ t: number; value: number }>;
  textOverlays?: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    startSec: number;
    endSec: number;
  }>;
  /**
   * Image overlays with alpha (PNG, WebP). Applied as FFmpeg `overlay`
   * stages during scene normalisation. Use for logos, lower-thirds,
   * watermarks, captions rendered offline as bitmap. Later layers paint
   * over earlier ones (z-order = array order).
   */
  imageOverlays?: Array<{
    /** Publicly reachable URL or canonical storage key of the asset. */
    url: string;
    /** Top-left x in output pixels. Use "center" for auto-centering. */
    x: number | "center";
    /** Top-left y in output pixels. Use "center" for auto-centering. */
    y: number | "center";
    /** Display width in pixels. If omitted, preserves source size. */
    width?: number;
    /** Opacity 0..1 applied uniformly on top of the PNG's own alpha. */
    opacity?: number;
    /** Seconds from scene start when the overlay becomes visible. */
    startSec?: number;
    /** Seconds from scene start when the overlay disappears. */
    endSec?: number;
    /**
     * Optional time-varying x keyframes (in output pixels). When set,
     * overrides the scalar `x`. Each `{ t, value }` is a seconds-from-
     * scene-start anchor. Compiled to an FFmpeg `overlay=x=expr` so the
     * layer slides over the scene.
     */
    xKeyframes?: Array<{ t: number; value: number }>;
    /** Same idea, vertical axis. */
    yKeyframes?: Array<{ t: number; value: number }>;
    /** Same idea for opacity, clamped to [0, 1]. */
    opacityKeyframes?: Array<{ t: number; value: number }>;
  }>;
}

/** private = only me, followers = my followers only, public = everyone */
export type Visibility = "private" | "followers" | "public";

export interface FollowEntry {
  followerId: string;
  followedId: string;
  createdAt: number;
}

export interface Project {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  stage: ProjectStage;
  // User input
  idea: string;
  genre: Genre;
  format: Format;
  tone: Tone;
  endingHint?: string;
  // Generated
  concept?: Concept;
  scenario?: Scenario;
  scenes?: Scene[];
  // Series linking — projects sharing the same seriesId form a season.
  seriesId?: string;
  seriesTitle?: string;
  episodeNumber?: number;
  // Presentation & publication
  coverUrl?: string;
  /** URL of the final composed MP4 (server-side render output). */
  outputUrl?: string;
  /** URL of the editorial master (ProRes/DNxHR .mov), Studio+ only. */
  masterUrl?: string;
  /** Origin of the content — governs AI-disclosure watermark requirements. */
  uploadType?: "ai_generated" | "user_upload";
  /** Adult-rated content flag (gates public display). */
  isAdult?: boolean;
  /** Marked as a reusable template (public library). */
  isTemplate?: boolean;
  /** Template filtering category (e.g. "trailer", "clip", "doc-short"). */
  templateCategory?: string;
  /** Template description shown in the gallery. */
  templateDescription?: string;
  // --- AI Music ---
  audioTrackUrl?: string;
  audioTrackStatus?: "idle" | "pending" | "ready" | "error";
  /** Target frame rate for the final render. Default 30. */
  targetFps?: 24 | 30 | 60;
  /** Global color grading preset applied during scene normalisation. */
  lutPreset?: LutPreset;
  /**
   * When set, the next final render also produces an editorial master
   * (ProRes 422 HQ or DNxHR HQ .mov). Gated to Studio/Family at render
   * time — free/pro projects ignore the field.
   */
  masterCodec?: MasterCodec;
  /**
   * Output colorspace. Default "sdr" (Rec.709). "hdr10" produces a PQ
   * HDR10 Rec.2020 master — Studio/Family tier only.
   */
  colorSpace?: ColorSpace;
  /**
   * Peak luminance of the mastering display, in nits. Drives the HDR10
   * `max-cll` / `master-display` metadata. Typical: 1000 (consumer HDR),
   * 4000 (reference HDR), 10000 (Dolby PQ peak). Only relevant when
   * colorSpace = "hdr10". Default 1000.
   */
  hdrPeakNits?: 600 | 1000 | 4000 | 10000;
  /**
   * Output audio layout.
   * - "stereo" (default) = 2.0 AAC
   * - "5.1"   = 6 channels via AC-3 (DVD-grade) or E-AC-3 (ATSC / DD+)
   * - "7.1"   = 8 channels via E-AC-3 only (AC-3 caps at 5.1)
   * - "ambisonic" = first-order ambisonic (B-format, 4 channels W X Y Z)
   *                 via libopus with mapping_family=2 — YouTube spatial
   *                 audio / Facebook 360 compatible, real 3D sound field
   * - "ambisonic-hoa2" = Second-order ambisonic, 9 channels (ACN / SN3D).
   *                 Higher spatial resolution than 1st-order; compatible
   *                 with AmbiX players (IEM Plugin Suite, Resonance Audio).
   * - "atmos" = Real Dolby Atmos via commercial cloud provider
   *             (configure via AIFLEX_ATMOS_PROVIDER + Dolby.io creds).
   *             Auto-downgrades to "atmos-stub" when no provider active.
   * - "atmos-stub" = Atmos-compatible signalling over 5.1 E-AC-3. No
   *                  real object metadata (needs licensed encoder).
   *                  "Dolby Atmos compatible" comment metadata.
   */
  audioLayout?:
    | "stereo"
    | "5.1"
    | "7.1"
    | "ambisonic"
    | "ambisonic-hoa2"
    | "ambisonic-hoa3"
    | "atmos"
    | "atmos-stub";
  /**
   * Surround codec. "ac3" = classic AC-3 (max 640 kbps, max 5.1,
   * broadest compatibility). "eac3" = E-AC-3 (supports 7.1, DD+).
   * Ignored when audioLayout is "ambisonic" or "atmos-stub".
   */
  surroundCodec?: "ac3" | "eac3";
  /**
   * Async Atmos state: "pending-atmos" while a Dolby.io cloud transcode
   * is in flight, "ready" once the webhook has persisted the output,
   * "failed" on unrecoverable provider error. Unset when no async atmos
   * job applies (all other audioLayout values are synchronous).
   */
  audioLayoutStatus?: "pending-atmos" | "ready" | "failed";
  published?: boolean;
  visibility?: Visibility;
  publishedAt?: number;
  views?: number;
  likes?: number;
  author?: string;
  /** Content rating for parental controls. */
  contentRating?: ContentRating;
}

// --- Users / auth -----------------------------------------------------

export type UserRole = "user" | "admin";

/**
 * Per-user usage counters. Reset whenever the calendar `month` changes.
 * Using a simple "YYYY-MM" string key keeps reset logic stateless.
 */
export interface UserUsage {
  /** "YYYY-MM" of the current accounting period. */
  month: string;
  videosGenerated: number;
  /** User-facing image generations this month. */
  imagesGenerated?: number;
  /**
   * Dolby Atmos cloud minutes consumed this month. Guards the Dolby.io
   * cost surface — see lib/plans.ts atmosMinutesPerMonth for tier caps.
   */
  atmosMinutesUsed?: number;
}

/** Who is allowed to start a direct conversation with the user. */
export type DmPolicy = "everyone" | "followers" | "nobody";

/**
 * Self-service preferences the user can tweak from their dashboard. Only
 * DB-backed, enforced preferences live here — client-only settings
 * (theme, cookie-based locale) stay out to avoid duplicate sources of
 * truth.
 */
export interface UserPreferences {
  /** Who can DM me. Defaults to "everyone" when absent. */
  allowDMs?: DmPolicy;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  suspended: boolean;
  createdAt: number;
  avatarSeed?: string;
  usage?: UserUsage;
  /** Public bio shown on the creator profile page. Max ~280 chars. */
  bio?: string;
  /** True once the user has clicked the verification link from their email. */
  emailVerified?: boolean;
  emailVerifiedAt?: number;
  /** Subscription plan. Defaults to "free" if absent. */
  plan?: "free" | "pro" | "studio" | "family";
  /** Timestamp (ms) when the current paid plan expires / renews. */
  planExpiresAt?: number;
  /** Self-service preferences — see UserPreferences. */
  preferences?: UserPreferences;
  /**
   * Explicit per-user override of the monthly Atmos cloud quota (minutes).
   * When undefined, the quota falls back to the plan default. Admin-only
   * surface — regular users cannot set this through PATCH /api/projects.
   */
  atmosMinutesQuota?: number;
}

/** User record as stored in the DB (includes password hash). Never ship to client. */
export interface UserRecord extends User {
  passwordHash: string;
  plan?: "free" | "pro" | "studio" | "family";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planExpiresAt?: number;
  oauthProvider?: "google" | "github" | "apple";
  oauthId?: string;
  /** TOTP secret for 2FA (base32-encoded). */
  totpSecret?: string;
  /** Whether 2FA is enabled. */
  totpEnabled?: boolean;
  /** Hashed backup codes for 2FA recovery. */
  totpBackupCodes?: string[];
  /** Parental control PIN (4-6 digits). */
  parentalPin?: string;
  /** Max content rating for this account (used when no profile system). */
  maxContentRating?: ContentRating;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  /** IP recorded when the session was created. */
  ipAddress?: string;
  /** UA string recorded at session start, truncated to 400 chars. */
  userAgent?: string;
  /** Updated on every request that uses this session. */
  lastSeenAt?: number;
}

export interface AuthedUser extends User {
  // Convenience: counts computed on the fly
}

// --- Engagement ------------------------------------------------------

export interface LikeEntry {
  userId: string;
  projectId: string;
  createdAt: number;
}

export interface WatchlistEntry {
  userId: string;
  projectId: string;
  addedAt: number;
}

export interface Comment {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  /** ID of the parent comment (for replies). */
  parentId?: string;
  /** Cached count of direct replies. */
  replyCount?: number;
}

export interface WatchProgress {
  userId: string;
  projectId: string;
  /** Index of the last scene the user was watching. */
  lastSceneIndex: number;
  /** 0..1 progress through the whole film. */
  progress: number;
  updatedAt: number;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterEmail: string;
  targetType: "project" | "comment";
  targetId: string;
  reason: string;
  detail?: string;
  status: "pending" | "reviewed" | "dismissed";
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export type NotificationKind =
  | "like"
  | "comment"
  | "remix"
  | "video-ready"
  | "atmos-ready"
  | "system";

export interface Notification {
  id: string;
  /** Recipient user ID. */
  userId: string;
  kind: NotificationKind;
  message: string;
  /** Deep link to navigate to on click. */
  href?: string;
  /** The user who triggered the notification (optional). */
  actorId?: string;
  actorName?: string;
  /** Related project (optional). */
  projectId?: string;
  read: boolean;
  createdAt: number;
}

// --- Push Notifications ------------------------------------------------

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
}

// --- Subtitles / Closed Captions ---------------------------------------

export interface SubtitleEntry {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  genre: Genre;
  tagline: string;
  description: string;
  coverUrl: string;
  backdropUrl: string;
  durationMin: number;
  year: number;
  rating: number;
  author: string;
  communityCreated?: boolean;
  /** URL of a short preview video (first scene) — autoplays on hover. */
  previewUrl?: string;
}

// --- Content Rating (Parental Controls) ------------------------------------

export type ContentRating = "G" | "PG" | "PG-13" | "R";

// --- Multi-Profiles --------------------------------------------------------

export interface Profile {
  id: string;
  userId: string;
  name: string;
  avatarSeed?: string;
  isChild: boolean;
  /** Maximum content rating this profile can view. */
  maxRating: ContentRating;
  createdAt: number;
}

// --- Direct Messages -------------------------------------------------------

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessageAt: number;
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  read: boolean;
  createdAt: number;
}

// --- Collaboration ---------------------------------------------------------

export type CollaboratorRole = "viewer" | "editor";

export interface Collaborator {
  id: string;
  projectId: string;
  userId: string;
  role: CollaboratorRole;
  invitedBy: string;
  createdAt: number;
}

// --- 2FA / TOTP ------------------------------------------------------------

export interface TwoFactorSetup {
  secret: string;
  backupCodes: string[];
}

// --- Creator Tips ----------------------------------------------------------

export interface Tip {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number; // in cents
  currency: string;
  stripePaymentId?: string;
  message?: string;
  createdAt: number;
}
