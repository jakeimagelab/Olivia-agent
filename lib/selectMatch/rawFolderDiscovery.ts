import type { BridgeRawFolderCandidate } from "@/lib/photo-bridge/recentFolder";
import { buildRawIndex } from "@/lib/selectMatch/rawIndex";

export type RawFolderDiscoveryAttempt = {
  name: string;
  distance: 0 | 1 | 2;
  matchedSamples: number;
};

export type RawFolderDiscoveryResult = {
  candidate: BridgeRawFolderCandidate | null;
  samples: string[];
  matchedSamples: number;
  attempts: RawFolderDiscoveryAttempt[];
};

function normalizeBasename(value: string) {
  return value
    .normalize("NFC")
    .replace(/\.[^.]+$/, "")
    .toLocaleLowerCase("en-US")
    .trim();
}

/** 선택 목록 전체를 훑지 않고 서로 다른 파일명 1~2개만 RAW 위치 탐색 표본으로 쓴다. */
export function representativeRawBasenames(names: Iterable<string>, limit = 2): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const basename = normalizeBasename(name);
    if (!basename || seen.has(basename)) continue;
    seen.add(basename);
    output.push(basename);
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * 현재 → 상위 → 두 단계 위 순서로 표본 RAW를 찾는다.
 * 두 표본을 모두 찾은 가장 가까운 폴더를 즉시 선택하고, 완전 일치가 없으면
 * 더 많이 찾은 후보(동률이면 가까운 후보)를 사용한다.
 */
export async function discoverRawFolder(input: {
  candidates: readonly BridgeRawFolderCandidate[];
  selectedNames: Iterable<string>;
  onCandidate?: (candidate: BridgeRawFolderCandidate) => void;
}): Promise<RawFolderDiscoveryResult> {
  const samples = representativeRawBasenames(input.selectedNames);
  const attempts: RawFolderDiscoveryAttempt[] = [];
  if (!samples.length) return { candidate: null, samples, matchedSamples: 0, attempts };

  const targets = new Set(samples);
  let best: { candidate: BridgeRawFolderCandidate; matchedSamples: number } | null = null;

  for (const candidate of input.candidates.slice(0, 3)) {
    input.onCandidate?.(candidate);
    const index = await buildRawIndex(candidate.handle, null, undefined, targets);
    const matchedSamples = samples.reduce((count, basename) => count + (index.has(basename) ? 1 : 0), 0);
    attempts.push({ name: candidate.name, distance: candidate.distance, matchedSamples });
    if (!best || matchedSamples > best.matchedSamples) best = { candidate, matchedSamples };
    if (matchedSamples === samples.length) {
      return { candidate, samples, matchedSamples, attempts };
    }
  }

  return {
    candidate: best && best.matchedSamples > 0 ? best.candidate : null,
    samples,
    matchedSamples: best?.matchedSamples ?? 0,
    attempts,
  };
}
