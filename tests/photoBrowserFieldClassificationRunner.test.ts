import { describe, expect, it, vi } from "vitest";

import { runBrowserFieldClassification } from "@/lib/photo-classifier/browserFieldClassificationRunner";
import type { TimestampedBrowserPhoto } from "@/lib/photo-classifier/fieldScanning";

function timestampedPhoto(name: string, mtime: number): TimestampedBrowserPhoto {
  return {
    name,
    mtime,
    timestampSource: "datetime_original",
    handle: { getFile: vi.fn() } as unknown as FileSystemFileHandle,
    file: {} as File,
  };
}

describe("runBrowserFieldClassification", () => {
  const rootDirectory = { name: "촬영" } as FileSystemDirectoryHandle;

  it("빠른 분석은 EXIF 촬영 순서로 Scene 계획만 만든다", async () => {
    const rawFiles = [{ name: "A.CR3", handle: {} as FileSystemFileHandle }];
    const onFilesScanned = vi.fn();
    const onStateChange = vi.fn();

    const result = await runBrowserFieldClassification({
      rootDirectory,
      department: "general",
      gapMinutes: 5,
      fastAnalyzeMode: true,
      aiNamingEnabled: false,
      departmentLogicEnabled: false,
      weightProfile: null,
      signal: new AbortController().signal,
      isCancelled: () => false,
      onFilesScanned,
      onStateChange,
      dependencies: {
        splitFiles: (async () => ({ rawFiles, jpgFiles: [] })) as never,
        readTimestamps: (async () => [
          timestampedPhoto("B.JPG", 600_000),
          timestampedPhoto("A.JPG", 0),
        ]) as never,
      },
    });

    expect(result.status).toBe("done");
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes.map((scene) => scene.files[0].name)).toEqual(["A.JPG", "B.JPG"]);
    expect(result.logs[0]).toContain("JPG 2장 / RAW 1개 / Scene 2개");
    expect(onFilesScanned).toHaveBeenCalledWith(rawFiles);
    expect(onStateChange).toHaveBeenCalledWith("READING_EXIF");
  });

  it("정밀 분석 취소 시 원본 이동 없이 cancelled 결과를 반환한다", async () => {
    const appendPurposeCandidates = vi.fn();
    const result = await runBrowserFieldClassification({
      rootDirectory,
      department: "general",
      gapMinutes: 5,
      fastAnalyzeMode: false,
      aiNamingEnabled: false,
      departmentLogicEnabled: false,
      weightProfile: null,
      signal: new AbortController().signal,
      isCancelled: () => true,
      dependencies: {
        splitFiles: (async () => ({ rawFiles: [], jpgFiles: [] })) as never,
        readTimestamps: (async () => [timestampedPhoto("A.JPG", 0)]) as never,
        extractFeatures: (async () => ({
          features: [],
          failedImages: 0,
          cachedImages: 0,
        })) as never,
        appendPurposeCandidates: appendPurposeCandidates as never,
      },
    });

    expect(result).toMatchObject({ status: "cancelled", scenes: [], boundaryDecisions: [] });
    expect(result.logs[0]).toContain("원본 파일은 이동되지 않았습니다");
    expect(appendPurposeCandidates).not.toHaveBeenCalled();
  });
});
