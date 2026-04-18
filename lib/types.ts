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

export type Tone = "epique" | "sombre" | "onirique" | "comique" | "tendu" | "intime" | "apocalyptique" | "nostalgique";

export type ProjectStage =
  | "idea"
  | "concept"
  | "scenario"
  | "scenes"
  | "visuals"
  | "assembly"
  | "published";

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
  videoUrl?: string;
  videoStatus?: "idle" | "pending" | "ready" | "error";
  videoError?: string;
  // --- Per-scene generation controls (editable in studio) ---
  aspectRatio?: "16:9" | "9:16" | "1:1";
  motionIntensity?: "slow" | "normal" | "fast";
  negativePrompt?: string;
  /** Generation mode for this scene. */
  generationMode?: "text-to-video" | "image-to-video" | "video-to-video";
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
  /** Timed subtitle entries for this scene. */
  subtitles?: SubtitleEntry[];
  // --- Video editor fields ---
  trimStart?: number;
  trimEnd?: number;
  transitionIn?: "cut" | "fade" | "dissolve" | "wipe-left" | "wipe-right";
  audioVolume?: number;
  textOverlays?: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    startSec: number;
    endSec: number;
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
  // --- AI Music ---
  audioTrackUrl?: string;
  audioTrackStatus?: "idle" | "pending" | "ready" | "error";
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
