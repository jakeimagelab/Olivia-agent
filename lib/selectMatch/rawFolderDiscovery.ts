import type { BridgeRawFolderCandidate } from "@/lib/photo-bridge/recentFolder";
import { buildRawIndex, shouldSkipRawScanDirectory } from "@/lib/selectMatch/rawIndex";

export type RawFolderDiscoveryAttempt = {
  name: string;
  distance: 0 | 1 | 2;
  matchedSamples: number;
  status: "checked" | "timeout" | "error";
  message?: string;
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
  onCandidate?: (candidate: BridgeRawFolderCandidate, index: number, total: number) => void;
  candidateTimeoutMs?: number;
}): Promise<RawFolderDiscoveryResult> {
  const samples = representativeRawBasenames(input.selectedNames);
  const attempts: RawFolderDiscoveryAttempt[] = [];
  if (!samples.length) return { candidate: null, samples, matchedSamples: 0, attempts };

  const targets = new Set(samples);
  let best: { candidate: BridgeRawFolderCandidate; matchedSamples: number } | null = null;

  const candidates = input.candidates.filter((candidate) => !shouldSkipRawScanDirectory(candidate.name)).slice(0, 3);
  const timeoutMs = Math.max(1, input.candidateTimeoutMs ?? 5_000);
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    input.onCandidate?.(candidate, candidateIndex + 1, candidates.length);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const index = await Promise.race([
        buildRawIndex(candidate.handle, null, undefined, targets, {
          stopAfterFirstPerTarget: true,
          maxDepth: 2,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("RAW_DISCOVERY_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
      const matchedSamples = samples.reduce((count, basename) => count + (index.has(basename) ? 1 : 0), 0);
      attempts.push({ name: candidate.name, distance: candidate.distance, matchedSamples, status: "checked" });
      if (!best || matchedSamples > best.matchedSamples) best = { candidate, matchedSamples };
      if (matchedSamples === samples.length) {
        return { candidate, samples, matchedSamples, attempts };
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "RAW_DISCOVERY_TIMEOUT";
      attempts.push({
        name: candidate.name,
        distance: candidate.distance,
        matchedSamples: 0,
        status: timedOut ? "timeout" : "error",
        message: timedOut ? "시간 초과" : error instanceof Error ? error.message : "확인 실패",
      });
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    candidate: best && best.matchedSamples > 0 ? best.candidate : null,
    samples,
    matchedSamples: best?.matchedSamples ?? 0,
    attempts,
  };
}
