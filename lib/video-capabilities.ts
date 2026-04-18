/**
 * Per-model capability map. The studio UI reads this to show/hide
 * controls dynamically based on the admin's selected video model.
 */

export type GenerationMode = "text-to-video" | "image-to-video" | "video-to-video";

export interface CameraPreset {
  value: string;
  label: string;
}

export interface VideoModelCapabilities {
  modes: GenerationMode[];
  /** Supported durations in seconds. */
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
  /** Whether the model accepts a negative prompt natively. */
  negativePrompt: boolean;
  /** Whether the model supports camera control syntax. */
  cameraControls: boolean;
  /** Camera control format: "bracket" = [Pan left], "descriptive" = via prompt. */
  cameraFormat?: "bracket" | "descriptive";
  cameraPresets?: CameraPreset[];
  /** Whether the model has a built-in prompt optimizer. */
  promptOptimizer: boolean;
  /** Max reference images for character consistency. */
  maxReferenceImages: number;
  /** Whether it generates audio with the video. */
  audio: boolean;
  /** Seed locking for reproducibility. */
  seedLocking: boolean;
}

const CAMERA_BRACKET_PRESETS: CameraPreset[] = [
  { value: "Truck left", label: "Travelling gauche" },
  { value: "Truck right", label: "Travelling droite" },
  { value: "Pan left", label: "Panoramique gauche" },
  { value: "Pan right", label: "Panoramique droite" },
  { value: "Tilt up", label: "Tilt haut" },
  { value: "Tilt down", label: "Tilt bas" },
  { value: "Zoom in", label: "Zoom avant" },
  { value: "Zoom out", label: "Zoom arrière" },
  { value: "Push in", label: "Push in" },
  { value: "Pull out", label: "Pull out" },
];

const CAMERA_DESCRIPTIVE_PRESETS: CameraPreset[] = [
  { value: "aerial view, drone shot", label: "Vue aérienne (drone)" },
  { value: "tracking shot following subject", label: "Tracking shot" },
  { value: "slow dolly in", label: "Dolly in lent" },
  { value: "handheld camera, slight shake", label: "Caméra à l'épaule" },
  { value: "static wide shot", label: "Plan fixe large" },
  { value: "close-up, shallow depth of field", label: "Gros plan" },
  { value: "sweeping crane shot", label: "Plan grue" },
  { value: "360 orbit around subject", label: "Orbite 360°" },
];

export const VIDEO_CAPABILITIES: Record<string, VideoModelCapabilities> = {
  "fal-ai/bytedance/seedance/v2/pro/text-to-video": {
    modes: ["text-to-video", "image-to-video"],
    durations: [5, 6, 7, 8, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: false,
    cameraControls: false,
    promptOptimizer: false,
    maxReferenceImages: 9,
    audio: true,
    seedLocking: true,
  },
  "fal-ai/bytedance/seedance/v1/pro/text-to-video": {
    modes: ["text-to-video"],
    durations: [5, 8],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: false,
    cameraControls: false,
    promptOptimizer: false,
    maxReferenceImages: 0,
    audio: false,
    seedLocking: true,
  },
  "fal-ai/veo3/text-to-video": {
    modes: ["text-to-video", "image-to-video"],
    durations: [5, 8, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    negativePrompt: false,
    cameraControls: true,
    cameraFormat: "descriptive",
    cameraPresets: CAMERA_DESCRIPTIVE_PRESETS,
    promptOptimizer: false,
    maxReferenceImages: 1,
    audio: true,
    seedLocking: false,
  },
  "fal-ai/kling-video/v2/master/text-to-video": {
    modes: ["text-to-video", "image-to-video"],
    durations: [5, 10],
    resolutions: ["1080p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: true,
    cameraControls: true,
    cameraFormat: "bracket",
    cameraPresets: CAMERA_BRACKET_PRESETS,
    promptOptimizer: false,
    maxReferenceImages: 1,
    audio: false,
    seedLocking: true,
  },
  "fal-ai/minimax/hailuo-02/pro/text-to-video": {
    modes: ["text-to-video", "image-to-video"],
    durations: [6, 8, 10],
    resolutions: ["768p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    negativePrompt: false,
    cameraControls: true,
    cameraFormat: "bracket",
    cameraPresets: CAMERA_BRACKET_PRESETS,
    promptOptimizer: true,
    maxReferenceImages: 1,
    audio: false,
    seedLocking: false,
  },
  "fal-ai/luma-dream-machine": {
    modes: ["text-to-video", "image-to-video", "video-to-video"],
    durations: [5, 8],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: false,
    cameraControls: false,
    promptOptimizer: false,
    maxReferenceImages: 1,
    audio: false,
    seedLocking: false,
  },
  "fal-ai/wan-ai/wan2.6/1080p/text-to-video": {
    modes: ["text-to-video", "image-to-video", "video-to-video"],
    durations: [3, 5, 7, 9],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: true,
    cameraControls: true,
    cameraFormat: "descriptive",
    cameraPresets: CAMERA_DESCRIPTIVE_PRESETS,
    promptOptimizer: true,
    maxReferenceImages: 3,
    audio: false,
    seedLocking: true,
  },
  "fal-ai/wan-ai/wan2.6/720p/text-to-video": {
    modes: ["text-to-video", "image-to-video", "video-to-video"],
    durations: [3, 5, 7, 9],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    negativePrompt: true,
    cameraControls: true,
    cameraFormat: "descriptive",
    cameraPresets: CAMERA_DESCRIPTIVE_PRESETS,
    promptOptimizer: true,
    maxReferenceImages: 3,
    audio: false,
    seedLocking: true,
  },
  "fal-ai/lightricks/ltx-video/v2.3": {
    modes: ["text-to-video", "image-to-video", "video-to-video"],
    durations: [3, 5, 8, 10],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    negativePrompt: true,
    cameraControls: true,
    cameraFormat: "descriptive",
    cameraPresets: CAMERA_DESCRIPTIVE_PRESETS,
    promptOptimizer: true,
    maxReferenceImages: 1,
    audio: false,
    seedLocking: true,
  },
};

/** Default capabilities for unknown models. */
const DEFAULT_CAPS: VideoModelCapabilities = {
  modes: ["text-to-video"],
  durations: [5, 8],
  resolutions: ["720p"],
  aspectRatios: ["16:9"],
  negativePrompt: false,
  cameraControls: false,
  promptOptimizer: false,
  maxReferenceImages: 0,
  audio: false,
  seedLocking: false,
};

export function getVideoCapabilities(modelId: string): VideoModelCapabilities {
  return VIDEO_CAPABILITIES[modelId] || DEFAULT_CAPS;
}

// --- LLM reasoning levels ------------------------------------------------

export type ReasoningLevel = "none" | "low" | "medium" | "high" | "xhigh";

export interface LLMCapabilities {
  supportsReasoning: boolean;
  reasoningLevels: ReasoningLevel[];
  defaultReasoning: ReasoningLevel;
}

export const LLM_CAPABILITIES: Record<string, LLMCapabilities> = {
  "gpt-5.4": {
    supportsReasoning: true,
    reasoningLevels: ["none", "low", "medium", "high", "xhigh"],
    defaultReasoning: "medium",
  },
  "claude-opus-4-6": {
    supportsReasoning: true,
    reasoningLevels: ["none", "medium", "high"],
    defaultReasoning: "none",
  },
  "claude-sonnet-4-6": {
    supportsReasoning: true,
    reasoningLevels: ["none", "medium"],
    defaultReasoning: "none",
  },
  "claude-haiku-4-5": {
    supportsReasoning: false,
    reasoningLevels: ["none"],
    defaultReasoning: "none",
  },
};

const DEFAULT_LLM: LLMCapabilities = {
  supportsReasoning: false,
  reasoningLevels: ["none"],
  defaultReasoning: "none",
};

export function getLLMCapabilities(modelId: string): LLMCapabilities {
  return LLM_CAPABILITIES[modelId] || DEFAULT_LLM;
}

export const REASONING_LABELS: Record<ReasoningLevel, string> = {
  none: "Standard — rapide",
  low: "Réflexion légère",
  medium: "Réflexion modérée",
  high: "Réflexion profonde",
  xhigh: "Réflexion maximale — lent mais meilleur",
};
