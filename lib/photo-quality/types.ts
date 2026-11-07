export const PHOTO_QUALITY_ANALYSIS_VERSION = "photo-quality-v1";
export const PHOTO_QUALITY_DEFAULT_MODEL = process.env.OPENAI_PHOTO_QUALITY_MODEL ?? "gpt-4.1-mini";

export const PHOTO_QUALITY_FLAGS = ["eyes_closed", "face_too_dark", "motion_blur"] as const;
export type PhotoQualityFlag = typeof PHOTO_QUALITY_FLAGS[number];
export type PhotoQualityStatus = "pending" | "analyzing" | "normal" | "suspected" | "needs_review" | "failed";
export type PhotoQualityReviewStatus = "unreviewed" | "confirmed_issue" | "confirmed_normal";

export type PhotoQualitySignal = {
  detected: boolean;
  confidence: number;
  assessable: boolean;
  reason: string;
};

export type PhotoQualityModelAssessment = {
  eyes_closed: PhotoQualitySignal;
  face_too_dark: PhotoQualitySignal;
  motion_blur: PhotoQualitySignal;
  peopleVisible: boolean;
  intentionalSilhouette: boolean;
  intentionalMotion: boolean;
};

export type PhotoQualityLocalMetrics = {
  blurScore: number;
  brightness: number;
};

export type PhotoQualityDecision = {
  status: Exclude<PhotoQualityStatus, "pending" | "analyzing" | "failed">;
  flags: PhotoQualityFlag[];
  confidence: Record<PhotoQualityFlag, number>;
  explanation: Record<PhotoQualityFlag, string>;
};

export type PublicPhotoQualityResult = {
  imageId: string;
  status: PhotoQualityStatus;
  flags: PhotoQualityFlag[];
  confidence: Partial<Record<PhotoQualityFlag, number>>;
  explanation: Partial<Record<PhotoQualityFlag, string>>;
  reviewStatus: PhotoQualityReviewStatus;
  analyzedAt: string | null;
};

export function isPhotoQualityFlag(value: unknown): value is PhotoQualityFlag {
  return typeof value === "string" && (PHOTO_QUALITY_FLAGS as readonly string[]).includes(value);
}
