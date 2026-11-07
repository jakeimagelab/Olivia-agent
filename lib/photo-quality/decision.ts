import type { PhotoQualityDecision, PhotoQualityFlag, PhotoQualityLocalMetrics, PhotoQualityModelAssessment } from "./types";

export const PHOTO_QUALITY_SUSPECT_THRESHOLD = 0.72;
export const PHOTO_QUALITY_REVIEW_THRESHOLD = 0.45;

/**
 * AI only supplies review assistance. Low-confidence or unassessable faces are
 * deliberately routed to needs_review instead of being forced into good/bad.
 */
export function decidePhotoQuality(
  assessment: PhotoQualityModelAssessment,
  local: PhotoQualityLocalMetrics,
): PhotoQualityDecision {
  const flags: PhotoQualityFlag[] = [];
  const confidence = {
    eyes_closed: assessment.eyes_closed.confidence,
    face_too_dark: assessment.face_too_dark.confidence,
    motion_blur: assessment.motion_blur.confidence,
  };
  const explanation = {
    eyes_closed: assessment.eyes_closed.reason,
    face_too_dark: assessment.face_too_dark.reason,
    motion_blur: assessment.motion_blur.reason,
  };

  const candidates: Array<[PhotoQualityFlag, typeof assessment.eyes_closed]> = [
    ["eyes_closed", assessment.eyes_closed],
    ["face_too_dark", assessment.face_too_dark],
    ["motion_blur", assessment.motion_blur],
  ];
  for (const [flag, signal] of candidates) {
    if (!assessment.peopleVisible && (flag === "eyes_closed" || flag === "face_too_dark")) continue;
    if (!signal.assessable) continue;
    if (!signal.detected || signal.confidence < PHOTO_QUALITY_SUSPECT_THRESHOLD) continue;
    if (flag === "face_too_dark" && assessment.intentionalSilhouette) continue;
    if (flag === "motion_blur" && assessment.intentionalMotion) continue;
    flags.push(flag);
  }

  const uncertain = candidates.some(([flag, signal]) => {
    if (!assessment.peopleVisible && (flag === "eyes_closed" || flag === "face_too_dark")) return false;
    return !signal.assessable
      || (signal.detected && signal.confidence >= PHOTO_QUALITY_REVIEW_THRESHOLD && signal.confidence < PHOTO_QUALITY_SUSPECT_THRESHOLD);
  });
  // A local metric can request review, but never independently mark a face or
  // motion defect. This prevents dark backgrounds and bokeh from becoming flags.
  const localNeedsReview = local.blurScore < 12 || local.brightness < 18;
  return {
    status: flags.length ? "suspected" : uncertain || localNeedsReview ? "needs_review" : "normal",
    flags,
    confidence,
    explanation,
  };
}
