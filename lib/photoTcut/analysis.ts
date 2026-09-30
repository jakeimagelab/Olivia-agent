export type TcutReason = "eyes_closed" | "blur" | "face_unreadable_lighting";

export type TcutChecks = {
  eyesClosed: boolean;
  blur: boolean;
  faceUnreadableLighting: boolean;
};

export type TcutVisualAssessment = {
  eyesClosed: boolean;
  faceUnreadableLighting: boolean;
  lightingReason: string | null;
};

export type TcutMetrics = {
  blurScore: number;
};

/** A conservative threshold: weak sharpness alone must not make a photo a T-cut. */
export const TCUT_BLUR_THRESHOLD = 18;

export function tcutReasons(
  metrics: TcutMetrics,
  assessment: TcutVisualAssessment | null,
  checks: TcutChecks,
): TcutReason[] {
  const reasons: TcutReason[] = [];
  if (checks.eyesClosed && assessment?.eyesClosed) reasons.push("eyes_closed");
  if (checks.blur && metrics.blurScore < TCUT_BLUR_THRESHOLD) reasons.push("blur");
  // Lighting requires the visual model to establish that a face cannot actually be identified;
  // average brightness is deliberately not used to reject merely dark photos.
  if (checks.faceUnreadableLighting && assessment?.faceUnreadableLighting) reasons.push("face_unreadable_lighting");
  return reasons;
}

export function tcutReasonLabel(reason: TcutReason): string {
  if (reason === "eyes_closed") return "눈 감음";
  if (reason === "blur") return "흔들림";
  return "조명 미발광 / 얼굴 식별 불가";
}

export function isTcutCandidate(reasons: readonly TcutReason[]): boolean {
  return reasons.length > 0;
}
