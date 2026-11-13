import { describe, expect, it } from "vitest";
import { prepareStudioPhotoFiles } from "@/lib/photo-classifier/studioScanning";
import type { SplitJpgFile } from "@/lib/photo-classifier/browserFileOps";

function makeSource(name: string, mtime: number): SplitJpgFile {
  return {
    name,
    handle: {} as FileSystemFileHandle,
    file: { name } as File,
    mtime,
    fileSize: 123,
  };
}

describe("prepareStudioPhotoFiles", () => {
  it("sorts by capture time and builds the same pending photo shape", async () => {
    const progress: number[] = [];
    const result = await prepareStudioPhotoFiles([
      makeSource("B.JPG", 200),
      makeSource("A.JPG", 100),
    ], {
      loadPreview: async (file) => ({ thumbUrl: `thumb:${file.name}`, brightness: 77 }),
      onProgress: ({ completed }) => progress.push(completed),
    });

    expect(result.map((file) => file.name)).toEqual(["A.JPG", "B.JPG"]);
    expect(result[0]).toMatchObject({
      basename: "A",
      thumbUrl: "thumb:A.JPG",
      brightness: 77,
      lightingStatus: "normal",
      clothingLabel: "미분류",
      analyzed: false,
      groupKey: "__PENDING__",
    });
    expect(progress).toHaveLength(2);
    expect(Math.max(...progress)).toBe(2);
  });

  it("limits simultaneous preview decoding", async () => {
    let active = 0;
    let maximumActive = 0;
    await prepareStudioPhotoFiles(
      Array.from({ length: 8 }, (_, index) => makeSource(`${index}.JPG`, index)),
      {
        concurrency: 3,
        loadPreview: async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return { thumbUrl: null, brightness: 128 };
        },
      },
    );

    expect(maximumActive).toBeLessThanOrEqual(3);
  });
});
