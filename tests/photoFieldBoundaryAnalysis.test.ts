import { describe, expect, it, vi } from "vitest";
import {
  analyzeBrowserSceneBoundary,
  appendBrowserPurposeTransitionCandidates,
} from "@/lib/photo-classifier/fieldBoundaryAnalysis";
import type { SceneFrameAnalysis, VisualBoundaryCandidate } from "@/lib/photo-classifier/hybrid-types";

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `IMG_${String(index).padStart(4, "0")}.JPG`,
    mtime: index * 1_000,
    timestampSource: "datetime_original" as const,
    file: { name: `IMG_${String(index).padStart(4, "0")}.JPG` } as File,
  }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("field browser AI boundary analysis", () => {
  it("adds purpose transitions without mutating the original candidates", async () => {
    const original: VisualBoundaryCandidate[] = [{
      boundaryIndex: 7,
      timeGapMs: 1_000,
      visualChangeScore: 0.8,
      hardGap: false,
      requiresAi: true,
    }];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      labels: [
        { index: 0, purpose: "consultation" },
        { index: 5, purpose: "treatment" },
        { index: 9, purpose: "treatment" },
      ],
    }));

    const result = await appendBrowserPurposeTransitionCandidates({
      entries: makeEntries(10),
      candidates: original,
      department: "ophthalmology",
      hardGapMinutes: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      thumbnailLoader: async (file) => `preview:${file.name}`,
    });

    expect(original).toHaveLength(1);
    expect(result.failures).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.boundaryIndex)).toEqual([3, 7]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps visual candidates when a non-critical purpose scan fails", async () => {
    const original: VisualBoundaryCandidate[] = [{
      boundaryIndex: 4,
      timeGapMs: 1_000,
      visualChangeScore: 0.8,
      hardGap: false,
      requiresAi: true,
    }];

    const result = await appendBrowserPurposeTransitionCandidates({
      entries: makeEntries(10),
      candidates: original,
      department: "dermatology",
      hardGapMinutes: 5,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "temporary" }, 503)) as unknown as typeof fetch,
      thumbnailLoader: async () => "preview",
    });

    expect(result.candidates).toEqual(original);
    expect(result.failures).toEqual([{ startIndex: 0, endIndex: 9, error: "temporary" }]);
  });

  it("retries boundary analysis once and preserves the requested image window", async () => {
    const analysis = { confidence: 0.92, reasons: ["장면 전환"] } as SceneFrameAnalysis;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "retry" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true, analysis }));

    const result = await analyzeBrowserSceneBoundary({
      entries: makeEntries(7),
      boundaryIndex: 3,
      windowSize: 2,
      useHighModel: true,
      department: "dermatology",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      imageLoader: async (file) => `image:${file.name}`,
      retryDelayMs: 0,
    });

    expect(result).toEqual(analysis);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)) as {
      before: Array<{ fileName: string }>;
      after: Array<{ fileName: string }>;
      options: { useHighModel: boolean };
      timeGapSeconds: number;
    };
    expect(request.before.map((image) => image.fileName)).toEqual(["IMG_0001.JPG", "IMG_0002.JPG"]);
    expect(request.after.map((image) => image.fileName)).toEqual(["IMG_0003.JPG", "IMG_0004.JPG"]);
    expect(request.options.useHighModel).toBe(true);
    expect(request.timeGapSeconds).toBe(1);
  });
});
