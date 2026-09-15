import type {
  HybridSceneType, SceneBoundaryDecision, SceneBoundaryFeatures, SceneClassificationSettings,
  SceneFrameAnalysis, VisualBoundaryCandidate,
} from "./hybrid-types";

// 요청서에 명시된 "강한 Scene 변경" 쌍 — 이 전환이면 시각적 diff가 작아도 강제 분리한다.
const STRONG_TRANSITIONS = new Set<`${HybridSceneType}>${HybridSceneType}`>([
  "consultation>treatment", "consultation>profile",
  "treatment>profile", "treatment>interior",
  "interior>consultation", "interior>profile",
]);
function isStrongTransition(before: HybridSceneType, after: HybridSceneType): boolean {
  return STRONG_TRANSITIONS.has(`${before}>${after}`);
}

export const BOUNDARY_WEIGHTS: SceneBoundaryFeatures = {
  personChangeScore: 0.28,
  locationChangeScore: 0.24,
  equipmentChangeScore: 0.22,
  sceneTypeChangeScore: 0.12,
  visualChangeScore: 0.07,
  poseChangeScore: 0.04,
  timeGapScore: 0.02,
  shotDistanceChangeScore: 0.01,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function boundaryFeaturesFromAnalysis(
  candidate: VisualBoundaryCandidate,
  analysis: SceneFrameAnalysis | null,
  settings: SceneClassificationSettings,
): SceneBoundaryFeatures {
  const timeGapScore = clamp01(candidate.timeGapMs / (settings.hardGapMinutes * 60_000));
  if (!analysis) {
    return {
      timeGapScore,
      personChangeScore: 0,
      locationChangeScore: 0,
      equipmentChangeScore: 0,
      poseChangeScore: 0,
      sceneTypeChangeScore: 0,
      visualChangeScore: candidate.visualChangeScore,
      shotDistanceChangeScore: 0,
    };
  }
  const primaryClinicianChanged = analysis.primaryClinicianChanged ?? false;
  const primaryClinicianConfidence = analysis.primaryClinicianChangeConfidence ?? 0;
  const roomChanged = analysis.roomChanged ?? analysis.locationChanged;
  const roomConfidence = analysis.roomChangeConfidence ?? analysis.locationChangeConfidence;
  const primaryDeviceChanged = analysis.primaryMedicalDeviceChanged
    ?? (analysis.equipmentChanged && Boolean(analysis.equipmentPresent));
  const primaryDeviceConfidence = analysis.primaryMedicalDeviceChangeConfidence
    ?? analysis.equipmentChangeConfidence;
  return {
    timeGapScore,
    // Generic people-count/group changes are deliberately soft. Only the
    // primary clinician identity is a reliable medical-scene boundary.
    personChangeScore: primaryClinicianChanged ? clamp01(primaryClinicianConfidence) : 0,
    locationChangeScore: roomChanged ? clamp01(roomConfidence) : 0,
    equipmentChangeScore: primaryDeviceChanged ? clamp01(primaryDeviceConfidence) : 0,
    // Pose, camera angle and shot distance are protected SAME_SCENE signals.
    poseChangeScore: 0,
    sceneTypeChangeScore: analysis.sceneTypeChanged ? 1 : 0,
    visualChangeScore: candidate.visualChangeScore,
    shotDistanceChangeScore: 0,
  };
}

// weights를 안 넘기면 기존 고정 BOUNDARY_WEIGHTS 그대로 — AI 사진 분류 2.0에서만 폴더별 동적
// weights를 넘기고, 기존 호출부(부서 프리셋 등)는 이 인자를 안 넘겨 동작이 완전히 동일하다.
export function calculateBoundaryScore(features: SceneBoundaryFeatures, weights: SceneBoundaryFeatures = BOUNDARY_WEIGHTS) {
  return clamp01((Object.keys(weights) as Array<keyof SceneBoundaryFeatures>)
    .reduce((score, key) => score + features[key] * weights[key], 0));
}

function forcedReasons(analysis: SceneFrameAnalysis | null): string[] {
  if (!analysis) return [];
  const reasons: string[] = [];
  const clinician = (analysis.primaryClinicianChanged ?? false)
    && (analysis.primaryClinicianChangeConfidence ?? 0) >= 0.75;
  const location = (analysis.roomChanged ?? analysis.locationChanged)
    && (analysis.roomChangeConfidence ?? analysis.locationChangeConfidence) >= 0.82;
  const equipment = (analysis.primaryMedicalDeviceChanged
    ?? (analysis.equipmentChanged && Boolean(analysis.equipmentPresent)))
    && (analysis.primaryMedicalDeviceChangeConfidence ?? analysis.equipmentChangeConfidence) >= 0.82;
  if (clinician) reasons.push("주체 의료진이 변경됨");
  if (location) reasons.push("촬영 장소가 명확히 변경됨");
  if (equipment) {
    const before = analysis.primaryMedicalDeviceIdBefore;
    const after = analysis.primaryMedicalDeviceIdAfter;
    reasons.push(before && after ? `주요 의료 장비 변경(${before} → ${after})` : "주요 의료 장비가 명확히 변경됨");
  }
  if (clinician && location) reasons.push("주체 의료진과 장소가 함께 변경됨");
  if (clinician && equipment) reasons.push("주체 의료진과 장비가 함께 변경됨");
  if (location && equipment) reasons.push("장소와 장비가 함께 변경됨");
  if (isStrongTransition(analysis.beforeSceneType, analysis.afterSceneType)) {
    reasons.push(`촬영목적 전환(${analysis.beforeSceneType} → ${analysis.afterSceneType})으로 강한 Scene 변경`);
  }
  return reasons;
}

function shouldHoldSameScene(analysis: SceneFrameAnalysis | null) {
  if (!analysis) return false;
  return !(analysis.primaryClinicianChanged ?? false)
    && !(analysis.roomChanged ?? analysis.locationChanged)
    && !(analysis.primaryMedicalDeviceChanged ?? (analysis.equipmentChanged && Boolean(analysis.equipmentPresent)))
    && !analysis.sceneTypeChanged
    ;
}

export function decideBoundary(args: {
  candidate: VisualBoundaryCandidate;
  analysis: SceneFrameAnalysis | null;
  settings: SceneClassificationSettings;
  beforeFileName: string;
  afterFileName: string;
  aiFailed?: boolean;
  weights?: SceneBoundaryFeatures;
}): SceneBoundaryDecision {
  const { candidate, analysis, settings } = args;
  const features = boundaryFeaturesFromAnalysis(candidate, analysis, settings);
  const ruleReasons = forcedReasons(analysis);
  let score = calculateBoundaryScore(features, args.weights);
  if (!analysis && args.aiFailed) score = candidate.visualChangeScore;
  if (shouldHoldSameScene(analysis)) score = Math.max(0, score - 0.15);
  const forced = candidate.hardGap || ruleReasons.length > 0;
  const decision = forced || score >= settings.splitThreshold
    ? "split"
    : score >= settings.reviewThreshold ? "review" : "merge";
  const reasons = candidate.hardGap
    ? [`시간 간격 ${Math.round(candidate.timeGapMs / 60_000)}분으로 강제 분리`]
    : [...ruleReasons, ...(analysis?.reasons ?? []), `경계 점수 ${score.toFixed(2)}`];
  return {
    boundaryIndex: candidate.boundaryIndex,
    beforeFileName: args.beforeFileName,
    afterFileName: args.afterFileName,
    score,
    decision,
    forced,
    source: candidate.hardGap ? "hard_gap" : analysis ? "ai" : args.aiFailed ? "ai_fallback" : "local",
    reasons,
    features,
    aiAnalysis: analysis,
    needsReview: decision === "review" || Boolean(args.aiFailed),
  };
}
