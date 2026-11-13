import { describe, expect, it } from "vitest";
import { readBrowserPhotoTimestamps } from "@/lib/photo-classifier/fieldScanning";
import type { SplitJpgFile } from "@/lib/photo-classifier/browserFileOps";

function source(name: string, mtime: number): SplitJpgFile {
  return {
    name,
    handle: {} as FileSystemFileHandle,
    file: { name } as File,
    mtime,
    fileSize: 100,
  };
}

describe("readBrowserPhotoTimestamps", () => {
  it("uses EXIF when available and falls back to mtime with a warning", async () => {
    const result = await readBrowserPhotoTimestamps([
      source("EXIF.JPG", 10),
      source("FALLBACK.JPG", 20),
    ], {
      readTimestamp: async (file) => file.name === "EXIF.JPG"
        ? { timestamp: 100, source: "datetime_original" }
        : null,
    });

    expect(result[0]).toMatchObject({ mtime: 100, timestampSource: "datetime_original", warning: undefined });
    expect(result[1]).toMatchObject({ mtime: 20, timestampSource: "mtime", warning: "EXIF 촬영시간 없음 — mtime 사용" });
  });

  it("limits simultaneous EXIF reads and reports every file", async () => {
    let active = 0;
    let maximumActive = 0;
    const progress: number[] = [];
    await readBrowserPhotoTimestamps(
      Array.from({ length: 12 }, (_, index) => source(`${index}.JPG`, index)),
      {
        concurrency: 4,
        readTimestamp: async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return null;
        },
        onProgress: ({ completed }) => progress.push(completed),
      },
    );

    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(progress).toHaveLength(12);
    expect(Math.max(...progress)).toBe(12);
  });
});
