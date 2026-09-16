import type {
  HybridSceneType, SceneBoundaryDecision, SceneBoundaryFeatures, SceneClassificationSettings,
  SceneFrameAnalysis, VisualBoundaryCandidate,
} from "./hybrid-types";

// 촬영 목적이 실제로 바뀐 경우에는 카테고리가 같다는 이유만으로 병합하지 않는다.
// etc는 불확실한 라벨이므로 목적 전환으로 취급하지 않는다.
function isMeaningfulPurposeTransition(before: HybridSceneType, after: HybridSceneType): boolean {
  return before !== after && before !== "etc" && after !== "etc";
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
  const handpieceChanged = analysis.primaryHandpieceChanged ?? false;
  const handpieceConfidence = analysis.primaryHandpieceChangeConfidence ?? 0;
  return {
    timeGapScore,
    // Generic people-count/group changes are deliberately soft. Only the
    // primary clinician identity is a reliable medical-scene boundary.
    personChangeScore: primaryClinicianChanged ? clamp01(primaryClinicianConfidence) : 0,
    locationChangeScore: roomChanged ? clamp01(roomConfidence) : 0,
    equipmentChangeScore: primaryDeviceChanged || handpieceChanged
      ? clamp01(Math.max(primaryDeviceConfidence, handpieceConfidence)) : 0,
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
  // 장소/방 변경은 단독으로는 강제 분리 트리거가 아니다 — 카메라 구도·배경 변화만으로
  // roomChanged가 높은 확신으로 찍히는 경우가 많다. 가중치 신호(locationChangeScore)로만
  // 반영하고, 다른 강제 사유(의료진/장비/목적)와 함께일 때만 설명 문구에 곁들인다.
  const location = (analysis.roomChanged ?? analysis.locationChanged)
    && (analysis.roomChangeConfidence ?? analysis.locationChangeConfidence) >= 0.82;
  const equipment = (analysis.primaryMedicalDeviceChanged
    ?? (analysis.equipmentChanged && Boolean(analysis.equipmentPresent)))
    && (analysis.primaryMedicalDeviceChangeConfidence ?? analysis.equipmentChangeConfidence) >= 0.80;
  const handpiece = (analysis.primaryHandpieceChanged ?? false)
    && (analysis.primaryHandpieceChangeConfidence ?? 0) >= 0.80;
  if (clinician) reasons.push("주체 의료진이 변경됨");
  if (equipment) {
    const before = analysis.primaryMedicalDeviceIdBefore;
    const after = analysis.primaryMedicalDeviceIdAfter;
    reasons.push(before && after ? `주요 의료 장비 변경(${before} → ${after})` : "주요 의료 장비가 명확히 변경됨");
  }
  if (handpiece) {
    const before = analysis.primaryHandpieceIdBefore;
    const after = analysis.primaryHandpieceIdAfter;
    reasons.push(before && after ? `주요 핸드피스 변경(${before} → ${after})` : "주요 핸드피스가 명확히 변경됨");
  }
  if (clinician && location) reasons.push("주체 의료진과 장소가 함께 변경됨");
  if (clinician && equipment) reasons.push("주체 의료진과 장비가 함께 변경됨");
  if (location && equipment) reasons.push("장소와 장비가 함께 변경됨");
  if (isMeaningfulPurposeTransition(analysis.beforeSceneType, analysis.afterSceneType)) {
    reasons.push(`촬영목적 전환(${analysis.beforeSceneType} → ${analysis.afterSceneType})으로 Scene 분리`);
  }
  return reasons;
}

function shouldHoldSameScene(analysis: SceneFrameAnalysis | null, timeGapMs: number) {
  if (!analysis) return false;
  if (timeGapMs >= 60_000) return false;
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
  if (shouldHoldSameScene(analysis, candidate.timeGapMs)) score = Math.max(0, score - 0.15);

  const hardGap = candidate.hardGap;
  const strongGap = !hardGap && candidate.strongGap;
  const mandatoryAi = candidate.timeGapMs >= settings.aiBoundaryStartSeconds * 1_000
    && candidate.timeGapMs < settings.aiBoundaryEndSeconds * 1_000;
  const forced = hardGap || strongGap || ruleReasons.length > 0;
  let decision: SceneBoundaryDecision["decision"];
  if (hardGap || strongGap || ruleReasons.length > 0) {
    decision = "split";
  } else if (mandatoryAi) {
    // 60–180초 경계는 AI가 높은 확신으로 SAME이라고 할 때만 병합한다.
    // AI 오류/낮은 확신을 로컬 점수로 덮어쓰면 장시간 촬영이 합쳐지는 문제가 재발한다.
    decision = args.aiFailed || !analysis
      ? "review"
      : analysis.confidence >= 0.85 ? "merge" : "review";
  } else {
    decision = score >= settings.splitThreshold
      ? "split"
      : score >= settings.reviewThreshold ? "review" : "merge";
  }
  const reasons = hardGap
    ? [`시간 간격 ${Math.round(candidate.timeGapMs / 1_000)}초로 HARD 강제 분리`]
    : strongGap
      ? [`시간 간격 ${Math.round(candidate.timeGapMs / 1_000)}초로 STRONG 강제 분리`]
      : [...ruleReasons, ...(analysis?.reasons ?? []), mandatoryAi ? `60~180초 AI 경계 검증(${analysis?.confidence?.toFixed(2) ?? "실패"})` : `경계 점수 ${score.toFixed(2)}`];
  return {
    boundaryIndex: candidate.boundaryIndex,
    beforeFileName: args.beforeFileName,
    afterFileName: args.afterFileName,
    score,
    decision,
    forced,
    source: hardGap ? "hard_gap" : strongGap ? "strong_gap" : analysis ? "ai" : args.aiFailed ? "ai_fallback" : "local",
    reasons,
    features,
    aiAnalysis: analysis,
    needsReview: decision === "review" || Boolean(args.aiFailed),
  };
}
