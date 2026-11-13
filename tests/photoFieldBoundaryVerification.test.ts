import { describe, expect, it, vi } from "vitest";

import { decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { getClassificationSettings } from "@/lib/photo-classifier/classification-settings";
import { verifyBrowserFieldBoundaries } from "@/lib/photo-classifier/fieldBoundaryVerification";
import type { TimestampedBrowserPhoto } from "@/lib/photo-classifier/fieldScanning";
import type { VisualBoundaryCandidate } from "@/lib/photo-classifier/hybrid-types";

function photo(name: string, mtime: number): TimestampedBrowserPhoto {
  return {
    name,
    mtime,
    timestampSource: "datetime_original",
    handle: {} as FileSystemFileHandle,
    file: {} as File,
  };
}

describe("verifyBrowserFieldBoundaries", () => {
  const settings = { ...getClassificationSettings("default", "precise"), minimumSceneImages: 1 };
  const entries = [photo("A.JPG", 0), photo("B.JPG", 200_000)];
  const candidate: VisualBoundaryCandidate = {
    boundaryIndex: 1,
    timeGapMs: 200_000,
    visualChangeScore: 0.6,
    hardGap: false,
    requiresAi: true,
  };

  it("캐시된 경계는 AI를 다시 호출하지 않고 복원한다", async () => {
    const cached = decideBoundary({
      candidate,
      analysis: null,
      settings,
      beforeFileName: "A.JPG",
      afterFileName: "B.JPG",
    });
    const analyzeBoundary = vi.fn();
    const saveCheckpoint = vi.fn();
    const progress = vi.fn();

    const result = await verifyBrowserFieldBoundaries({
      entries,
      candidates: [candidate],
      settings,
      department: "general",
      checkpointId: "cached",
      analyzeBoundary: analyzeBoundary as never,
      loadCheckpoint: async () => ({ decisions: { "A.JPG→B.JPG": cached } }),
      saveCheckpoint,
      onProgress: progress,
    });

    expect(result).toEqual([cached]);
    expect(analyzeBoundary).not.toHaveBeenCalled();
    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith({ completed: 1, total: 1, restored: true });
  });

  it("AI 검증 실패는 파일을 임의 분리하지 않고 확인 필요 결과로 보존한다", async () => {
    const saveCheckpoint = vi.fn(async () => undefined);

    const result = await verifyBrowserFieldBoundaries({
      entries,
      candidates: [candidate],
      settings,
      department: "general",
      checkpointId: "failed-ai",
      analyzeBoundary: (async () => { throw new Error("offline"); }) as never,
      loadCheckpoint: async () => null,
      saveCheckpoint,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: "ai_fallback", needsReview: true });
    expect(saveCheckpoint).toHaveBeenCalledOnce();
  });

  it("하드 시간 간격은 AI 호출 없이 강제 분리한다", async () => {
    const hardCandidate = { ...candidate, hardGap: true, timeGapMs: 600_000 };
    const analyzeBoundary = vi.fn();

    const result = await verifyBrowserFieldBoundaries({
      entries,
      candidates: [hardCandidate],
      settings,
      department: "general",
      checkpointId: "hard-gap",
      analyzeBoundary: analyzeBoundary as never,
      loadCheckpoint: async () => null,
      saveCheckpoint: async () => undefined,
    });

    expect(result[0]).toMatchObject({ decision: "split", forced: true, source: "hard_gap" });
    expect(analyzeBoundary).not.toHaveBeenCalled();
  });
});
