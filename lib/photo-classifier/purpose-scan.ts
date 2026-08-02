import type { HybridSceneType } from "./hybrid-types";

export type PurposeSample = { index: number; purpose: HybridSceneType };

/**
 * "임시 Scene" 구간 안에서 촬영목적 전환을 찾기 위해 샘플링할 사진 인덱스를 계산한다.
 * 6장 고정 샘플 대신 구간 크기에 비례한 밀도로 샘플링하되, 비용을 위해 상한을 둔다.
 */
export function buildPurposeSampleIndices(
  segmentLength: number,
  options?: { interval?: number; maxSamples?: number },
): number[] {
  if (segmentLength <= 0) return [];
  if (segmentLength === 1) return [0];
  const interval = Math.max(1, options?.interval ?? 5);
  const maxSamples = Math.max(2, options?.maxSamples ?? 24);

  if (segmentLength <= maxSamples) {
    const indices = new Set<number>();
    for (let i = 0; i < segmentLength; i += interval) indices.add(i);
    indices.add(segmentLength - 1);
    return Array.from(indices).sort((a, b) => a - b);
  }

  // 구간이 너무 커서 interval 그대로 쓰면 상한을 넘는 경우 — maxSamples개로 균등 배분
  const step = (segmentLength - 1) / (maxSamples - 1);
  const indices = new Set<number>();
  for (let i = 0; i < maxSamples; i++) indices.add(Math.round(i * step));
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * 샘플된 목적 라벨을 순서대로 훑어 값이 바뀌는 지점(근사 경계 인덱스)을 찾는다.
 * 반환값은 "이 인덱스 직전과 직후가 다른 Scene일 가능성이 높다"는 근사치이며,
 * 정확한 사진 단위 경계는 이후 3장 윈도우 AI 검증으로 다시 확인한다.
 */
export function findPurposeTransitions(samples: PurposeSample[]): number[] {
  const sorted = [...samples].sort((left, right) => left.index - right.index);
  const transitions: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].purpose === sorted[i - 1].purpose) continue;
    const midpoint = Math.round((sorted[i - 1].index + sorted[i].index) / 2);
    transitions.push(Math.max(sorted[i - 1].index + 1, midpoint));
  }
  return transitions;
}
