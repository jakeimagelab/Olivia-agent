import type { ClassificationProfile, SceneClassificationSettings } from "./hybrid-types";

export const DERMATOLOGY_PRECISE_SETTINGS: SceneClassificationSettings = {
  mode: "precise",
  profile: "dermatology",
  hardGapMinutes: 3.5,
  softGapSeconds: 25,
  splitThreshold: 0.72,
  reviewThreshold: 0.55,
  minimumSceneImages: 2,
  maximumCandidateImages: 2000,
  scanWindowSize: 3,
  localCandidateThreshold: 0.42,
  softGapVisualThreshold: 0.28,
  usePersonDetection: true,
  useFaceEmbedding: false,
  useBackgroundEmbedding: true,
  useEquipmentDetection: true,
  useHighResolutionVerification: true,
  maxConcurrentJobs: 3,
  maxConcurrentAiJobs: 2,
};

export const DEFAULT_PRECISE_SETTINGS: SceneClassificationSettings = {
  ...DERMATOLOGY_PRECISE_SETTINGS,
  profile: "default",
};

export const FAST_SETTINGS: SceneClassificationSettings = {
  ...DEFAULT_PRECISE_SETTINGS,
  mode: "fast",
  usePersonDetection: false,
  useBackgroundEmbedding: false,
  useEquipmentDetection: false,
  useHighResolutionVerification: false,
};

export function getClassificationSettings(profile: ClassificationProfile, mode: "fast" | "precise") {
  if (mode === "fast") return { ...FAST_SETTINGS, profile };
  return { ...(profile === "dermatology" ? DERMATOLOGY_PRECISE_SETTINGS : DEFAULT_PRECISE_SETTINGS) };
}
