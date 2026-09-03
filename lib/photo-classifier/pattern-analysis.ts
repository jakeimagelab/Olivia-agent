// AI 사진 분류 2.0 — 폴더 통계, 동적 가중치 프로필, 자연어 override 타입/순수 함수.
// 기존 boundary-score.ts(BOUNDARY_WEIGHTS/decideBoundary)와 candidate-builder.ts는 그대로 두고,
// 이 파일이 "이번 폴더엔 어떤 weights/threshold를 쓸지"만 계산해서 그 함수들에 넘겨준다.
import type { LocalVisualFeatures, SceneBoundaryFeatures } from "./hybrid-types";
import type { FieldScene } from "./types";
import { visualChangeScore } from "./visual-feature";
import { BOUNDARY_WEIGHTS } from "./boundary-score";

// ── 폴더 통계 (신규 AI 호출 없이 이미 계산된 timestamp/visual feature에서 순수 계산) ──────
export type FolderTimeStats = {
  fileCount: number;
  medianIntervalSec: number;
  p90IntervalSec: number;
  p95IntervalSec: number;
  maxIntervalSec: number;
  largeGapCount: number;
};

export type FolderVisualStats = {
  meanChangeScore: number;
  stdDevChangeScore: number;
  highChangeRatio: number;
};

export type FolderStats = {
  time: FolderTimeStats;
  visual: FolderVisualStats | null;
  cameraModelCount: number;
};

function median(sortedValues: number[]) {
  if (!sortedValues.length) return 0;
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0 ? (sortedValues[middle - 1] + sortedValues[middle]) / 2 : sortedValues[middle];
}

function percentile(sortedValues: number[], ratio: number) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(ratio * sortedValues.length));
  return sortedValues[index];
}

export function computeFolderTimeStats(mtimesMs: number[]): FolderTimeStats {
  const sorted = [...mtimesMs].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) intervals.push((sorted[index] - sorted[index - 1]) / 1000);
  if (!intervals.length) {
    return { fileCount: sorted.length, medianIntervalSec: 0, p90IntervalSec: 0, p95IntervalSec: 0, maxIntervalSec: 0, largeGapCount: 0 };
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianIntervalSec = median(sortedIntervals);
  // 중간값의 20배(또는 최소 2분) 이상 벌어진 구간만 "큰 gap"으로 센다 — 평소 5초 간격이면
  // 100초만 벌어져도 이례적이지만, 평소 40초 간격이면 800초는 돼야 이례적이라는 뜻.
  const largeGapThreshold = Math.max(medianIntervalSec * 20, 120);
  return {
    fileCount: sorted.length,
    medianIntervalSec,
    p90IntervalSec: percentile(sortedIntervals, 0.9),
    p95IntervalSec: percentile(sortedIntervals, 0.95),
    maxIntervalSec: sortedIntervals[sortedIntervals.length - 1],
    largeGapCount: intervals.filter((value) => value > largeGapThreshold).length,
  };
}

export function computeFolderVisualStats(features: LocalVisualFeatures[]): FolderVisualStats | null {
  if (features.length < 2) return null;
  const scores: number[] = [];
  for (let index = 1; index < features.length; index += 1) scores.push(visualChangeScore(features[index - 1], features[index]));
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  return {
    meanChangeScore: mean,
    stdDevChangeScore: Math.sqrt(variance),
    highChangeRatio: scores.filter((value) => value > 0.5).length / scores.length,
  };
}

export function computeFolderStats(mtimesMs: number[], visualFeatures: LocalVisualFeatures[], cameraModelCount: number): FolderStats {
  return {
    time: computeFolderTimeStats(mtimesMs),
    visual: computeFolderVisualStats(visualFeatures),
    cameraModelCount,
  };
}

// ── Dynamic Weight Profile — boundary-score.ts의 SceneBoundaryFeatures 키를 그대로 재사용 ──
export type SceneWeightProfile = {
  weights: SceneBoundaryFeatures;
  splitThreshold: number;
  reviewThreshold: number;
  /** null/undefined = 자동(기존 hardGapMinutes fallback), 숫자면 "N분 이상 무조건 분리" 강제 */
  absoluteTimeGapMinutes?: number | null;
};

export const DEFAULT_WEIGHT_PROFILE: SceneWeightProfile = {
  weights: { ...BOUNDARY_WEIGHTS },
  splitThreshold: 0.72,
  reviewThreshold: 0.55,
  absoluteTimeGapMinutes: null,
};

export type FolderShootingPattern = {
  shootingType: string;
  observations: string[];
  profile: SceneWeightProfile;
  recommendedSceneCountHint?: number | null;
};

// ── 자연어 → 구조화 override (스펙 40) ──────────────────────────────────────────────
export type SensitivityLevel = "low" | "medium" | "high";

export type ClassificationOverrides = {
  timeGapMode?: "auto" | "soft" | "hard";
  absoluteTimeGapMinutes?: number;
  locationSensitivity?: SensitivityLevel;
  personSensitivity?: SensitivityLevel;
  backgroundSensitivity?: SensitivityLevel;
  compositionSensitivity?: SensitivityLevel;
  splitOnPersonChange?: boolean;
  splitOnLocationChange?: boolean;
  minSceneSize?: number;
};

const SENSITIVITY_MULTIPLIER: Record<SensitivityLevel, number> = { low: 0.55, medium: 1, high: 1.7 };

function normalizeWeights(weights: SceneBoundaryFeatures): SceneBoundaryFeatures {
  const entries = Object.entries(weights) as Array<[keyof SceneBoundaryFeatures, number]>;
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total])) as SceneBoundaryFeatures;
}

// 사용자 자연어에서 파싱된 override를 현재 profile에 머지한다. UI 자유입력을 그대로 실행하는
// 게 아니라 이 화이트리스트 필드만 반영되므로 임의 코드 실행 위험이 없다(스펙 20).
export function applyOverrides(profile: SceneWeightProfile, overrides: ClassificationOverrides): SceneWeightProfile {
  const weights = { ...profile.weights };
  if (overrides.personSensitivity) weights.personChangeScore *= SENSITIVITY_MULTIPLIER[overrides.personSensitivity];
  if (overrides.locationSensitivity) weights.locationChangeScore *= SENSITIVITY_MULTIPLIER[overrides.locationSensitivity];
  // 스펙의 "배경 변화"는 기존 엔진의 visualChangeScore(dHash/히스토그램/배경·구도 그리드
  // 합성 점수)에, "구도 변화"는 shotDistanceChangeScore(wide/medium/closeup AI 판정)에 대응한다.
  if (overrides.backgroundSensitivity) weights.visualChangeScore *= SENSITIVITY_MULTIPLIER[overrides.backgroundSensitivity];
  if (overrides.compositionSensitivity) weights.shotDistanceChangeScore *= SENSITIVITY_MULTIPLIER[overrides.compositionSensitivity];
  if (overrides.splitOnPersonChange) weights.personChangeScore = Math.max(weights.personChangeScore, 0.9);
  if (overrides.splitOnLocationChange) weights.locationChangeScore = Math.max(weights.locationChangeScore, 0.9);

  let absoluteTimeGapMinutes = profile.absoluteTimeGapMinutes ?? null;
  if (overrides.timeGapMode === "hard" && overrides.absoluteTimeGapMinutes) absoluteTimeGapMinutes = overrides.absoluteTimeGapMinutes;
  else if (overrides.timeGapMode === "auto") absoluteTimeGapMinutes = null;

  return { weights: normalizeWeights(weights), splitThreshold: profile.splitThreshold, reviewThreshold: profile.reviewThreshold, absoluteTimeGapMinutes };
}

// "너무 잘게 나눴어"(coarser) / "더 세분화해줘"(finer) — 스펙 21의 전체 강도 조정.
export function adjustGranularity(profile: SceneWeightProfile, direction: "coarser" | "finer"): SceneWeightProfile {
  const step = 0.06;
  const delta = direction === "coarser" ? step : -step;
  return {
    ...profile,
    splitThreshold: Math.min(0.95, Math.max(0.3, profile.splitThreshold + delta)),
    reviewThreshold: Math.min(0.9, Math.max(0.2, profile.reviewThreshold + delta)),
  };
}

// ── UI 미리보기용 Scene 요약 (스펙 39) — 기존 FieldScene에서 파생, 새 저장 구조 아님 ──────
export type SceneProposal = {
  id: string;
  startIndex: number;
  endIndex: number;
  fileCount: number;
  startTime?: string;
  endTime?: string;
  representativeFiles: string[];
  reasons: string[];
  confidence?: number;
};

export function sceneProposalFromFieldScene(scene: FieldScene): SceneProposal {
  return {
    id: `scene-${scene.index}`,
    startIndex: scene.index,
    endIndex: scene.index,
    fileCount: scene.fileCount,
    startTime: scene.startTime ? new Date(scene.startTime).toISOString() : undefined,
    endTime: scene.endTime ? new Date(scene.endTime).toISOString() : undefined,
    representativeFiles: scene.files.slice(0, 5).map((file) => file.thumbUrl || "").filter(Boolean),
    reasons: scene.boundaryBefore?.reasons ?? [],
    confidence: scene.aiConfidence ?? undefined,
  };
}
