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

function changed<T>(left: T, right: T, unknown: T) {
  return left !== unknown && right !== unknown && left !== right;
}

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
  return {
    timeGapScore,
    personChangeScore: analysis.dominantPersonChanged ? clamp01(analysis.personChangeConfidence) : 0,
    locationChangeScore: analysis.locationChanged ? clamp01(analysis.locationChangeConfidence) : 0,
    equipmentChangeScore: analysis.equipmentChanged ? clamp01(analysis.equipmentChangeConfidence) : 0,
    poseChangeScore: changed(analysis.beforePatientPose, analysis.afterPatientPose, "unknown")
      ? analysis.beforePatientPose === "sitting" && analysis.afterPatientPose === "lying" ? 1 : 0.65
      : 0,
    sceneTypeChangeScore: analysis.sceneTypeChanged ? 1 : 0,
    visualChangeScore: candidate.visualChangeScore,
    shotDistanceChangeScore: changed(analysis.beforeShotDistance, analysis.afterShotDistance, "unknown") ? 0.7 : 0,
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
  const person = analysis.dominantPersonChanged && analysis.personChangeConfidence >= 0.7;
  const location = analysis.locationChanged && analysis.locationChangeConfidence >= 0.7;
  const equipment = analysis.equipmentChanged && analysis.equipmentChangeConfidence >= 0.7;
  if (analysis.dominantPersonChanged && analysis.personChangeConfidence >= 0.88) reasons.push("주요 환자·인물 그룹이 변경됨");
  if (analysis.locationChanged && analysis.locationChangeConfidence >= 0.92) reasons.push("촬영 장소가 명확히 변경됨");
  if (analysis.equipmentChanged && analysis.equipmentChangeConfidence >= 0.92) reasons.push("주요 의료 장비가 명확히 변경됨");
  if (person && location) reasons.push("주요 인물과 장소가 함께 변경됨");
  if (person && equipment) reasons.push("주요 인물과 장비가 함께 변경됨");
  if (location && equipment) reasons.push("장소와 장비가 함께 변경됨");
  if (isStrongTransition(analysis.beforeSceneType, analysis.afterSceneType)) {
    reasons.push(`촬영목적 전환(${analysis.beforeSceneType} → ${analysis.afterSceneType})으로 강한 Scene 변경`);
  }
  if (analysis.beforePatientPose === "sitting" && analysis.afterPatientPose === "lying" && analysis.equipmentPresent) {
    reasons.push("환자가 앉은 자세에서 누운 자세로 바뀌고 장비가 등장함");
  }
  return reasons;
}

function shouldHoldSameScene(analysis: SceneFrameAnalysis | null) {
  if (!analysis) return false;
  return !analysis.dominantPersonChanged
    && !analysis.locationChanged
    && !analysis.equipmentChanged
    && !analysis.sceneTypeChanged
    && changed(analysis.beforeShotDistance, analysis.afterShotDistance, "unknown");
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
