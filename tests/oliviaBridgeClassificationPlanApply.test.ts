import { describe, expect, it } from "vitest";
import { createBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import { prepareBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlanApply";
import { manualPhotoDepartmentResolution } from "@/lib/photo-classifier/departmentResolver";
import type { BridgeSceneAnalysis } from "@/lib/photo-bridge/bridgeFiles";

const visualFeatures = {
  dHash: "0".repeat(64),
  colorHistogram: new Array(64).fill(0),
  backgroundGrid: new Array(24).fill(0),
  compositionGrid: new Array(16).fill(0),
  brightness: 0,
};

function fileEntry(name: string, size: number, lastModified: number) {
  const file = { name, size, lastModified } as File;
  const handle = {
    kind: "file",
    name,
    getFile: async () => file,
  } as unknown as FileSystemFileHandle;
  return { file, handle };
}

describe("prepareBridgeClassificationPlan", () => {
  it("validates the folder and prepares existing review state", async () => {
    const first = fileEntry("A.JPG", 101, 1001);
    const second = fileEntry("B.JPG", 102, 1002);
    const raw = fileEntry("A.CR3", 201, 1001);
    const directory = {
      kind: "directory",
      name: "촬영본",
      entries: async function* () {
        yield ["A.JPG", first.handle] as [string, FileSystemHandle];
        yield ["B.JPG", second.handle] as [string, FileSystemHandle];
        yield ["A.CR3", raw.handle] as [string, FileSystemHandle];
      },
    } as unknown as FileSystemDirectoryHandle;
    const analysis: BridgeSceneAnalysis = {
      files: [
        {
          id: "A.JPG", name: "A.JPG", relativeDirectory: "", relativePath: "A.JPG", extension: "JPG",
          handle: first.handle, file: first.file, size: 101, lastModified: 1001, mtime: 1001,
          timestampSource: "datetime_original", visualFeatures,
        },
        {
          id: "B.JPG", name: "B.JPG", relativeDirectory: "", relativePath: "B.JPG", extension: "JPG",
          handle: second.handle, file: second.file, size: 102, lastModified: 1002, mtime: 1002,
          timestampSource: "datetime_original", visualFeatures,
        },
      ],
      boundaries: [],
      scenes: [{
        id: "scene-1", label: "Scene 1", startIndex: 0, endIndex: 2, fileCount: 2,
        firstFileName: "A.JPG", lastFileName: "B.JPG", representativeFileName: "A.JPG", needsReview: false,
      }],
    };
    const plan = createBridgeClassificationPlan({
      folderKey: "촬영본",
      folderName: "촬영본",
      directory,
      analysis,
      departmentResolution: manualPhotoDepartmentResolution("dermatology"),
      id: "plan-1",
      createdAt: "2026-11-13T00:00:00.000Z",
    });

    const prepared = await prepareBridgeClassificationPlan({
      currentLocalFolder: directory,
      plan,
      loadThumbnail: async (handle) => `thumb:${handle.name}`,
    });

    expect(prepared.rawFiles.map((entry) => entry.name)).toEqual(["A.CR3"]);
    expect(prepared.scenes[0].files.map((entry) => entry.thumbUrl)).toEqual([
      "thumb:A.JPG",
      "thumb:B.JPG",
    ]);
    expect(prepared.stats).toMatchObject({ totalJpg: 2, totalRaw: 1, totalScenes: 1 });
    expect(prepared.summary).toEqual({ sceneCount: 1, jpgCount: 2, reviewCount: 0 });
  });
});
