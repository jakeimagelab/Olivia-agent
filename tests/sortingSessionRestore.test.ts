import { describe, expect, it } from "vitest";
import {
  canRestoreUnmovedSortingSession,
  restoreMovedSortingScenes,
  restoreSortingSession,
  restoreUnmovedSortingScenes,
} from "@/lib/photo-classifier/sortingSessionRestore";
import type { SavedSortingSession } from "@/lib/photo-classifier/sortingSession";

function fileHandle(name: string, lastModified = 1234) {
  return {
    kind: "file",
    name,
    getFile: async () => ({ name, lastModified }),
  } as unknown as FileSystemFileHandle;
}

function directoryHandle(
  name: string,
  entries: Array<[string, FileSystemHandle]>,
  children: Record<string, FileSystemDirectoryHandle> = {},
) {
  return {
    kind: "directory",
    name,
    entries: async function* () {
      for (const entry of entries) yield entry;
    },
    getDirectoryHandle: async (childName: string) => {
      const child = children[childName];
      if (!child) throw new DOMException("not found", "NotFoundError");
      return child;
    },
  } as unknown as FileSystemDirectoryHandle;
}

const saved: SavedSortingSession = {
  version: 2,
  savedAt: "2026-11-13T00:00:00.000Z",
  step: 2,
  rootDirName: "촬영",
  department: "dermatology",
  gapMinutes: 3.5,
  fastAnalyzeMode: false,
  departmentLogicEnabled: true,
  aiNamingEnabled: false,
  qualityAnalysisEnabled: false,
  profileClassificationEnabled: false,
  rawSelectMode: "copy",
  fieldRawCount: 1,
  fieldStats: null,
  sceneSummary: [{
    index: 0,
    folderName: "Scene01",
    editedName: "상담",
    startTime: 1000,
    endTime: 2000,
    fileCount: 2,
    sceneType: "consultation",
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    fileNames: ["B.JPG", "A.JPG"],
  }],
};

describe("sorting session restore", () => {
  it("rebuilds moved scenes from their JPG folders", async () => {
    const sceneDir = directoryHandle("Scene01", [
      ["B.JPG", fileHandle("B.JPG")],
      ["notes.txt", fileHandle("notes.txt")],
      ["A.JPG", fileHandle("A.JPG")],
    ]);
    const jpgBase = directoryHandle("JPG", [], { Scene01: sceneDir });

    const scenes = await restoreMovedSortingScenes(jpgBase, saved.sceneSummary);

    expect(scenes[0].files.map((file) => file.name)).toEqual(["A.JPG", "B.JPG"]);
    expect(scenes[0]).toMatchObject({ sceneDir, fileCount: 2, sceneType: "consultation" });
  });

  it("reconnects unmoved JPGs and keeps RAW handles", async () => {
    const root = directoryHandle("촬영", [
      ["A.JPG", fileHandle("A.JPG", 1111)],
      ["B.JPG", fileHandle("B.JPG", 2222)],
      ["A.CR3", fileHandle("A.CR3")],
    ]);

    const result = await restoreUnmovedSortingScenes(root, saved.sceneSummary);

    expect(result.rawFiles.map((file) => file.name)).toEqual(["A.CR3"]);
    expect(result.scenes[0].files.map((file) => [file.name, file.mtime])).toEqual([
      ["B.JPG", 2222],
      ["A.JPG", 1111],
    ]);
  });

  it("restores only v2 sessions with saved file names", () => {
    expect(canRestoreUnmovedSortingSession(saved)).toBe(true);
    expect(canRestoreUnmovedSortingSession({ ...saved, version: 1 })).toBe(false);
    expect(canRestoreUnmovedSortingSession({
      ...saved,
      sceneSummary: [{ ...saved.sceneSummary[0], fileNames: undefined }],
    })).toBe(false);
  });

  it("returns one restore plan for a moved JPG session", async () => {
    const sceneDir = directoryHandle("Scene01", [["A.JPG", fileHandle("A.JPG")]]);
    const jpgBase = directoryHandle("JPG", [], { Scene01: sceneDir });
    const root = directoryHandle("촬영", [], { JPG: jpgBase });

    const restored = await restoreSortingSession(root, { ...saved, step: 3 });

    expect(restored).toMatchObject({ kind: "moved", jpgBase, targetStep: 2 });
    expect(restored.kind === "moved" ? restored.scenes[0].files[0].name : null).toBe("A.JPG");
  });

  it("returns an unmoved plan only when saved file names can be reconnected", async () => {
    const root = directoryHandle("촬영", [
      ["A.JPG", fileHandle("A.JPG")],
      ["B.JPG", fileHandle("B.JPG")],
      ["A.CR3", fileHandle("A.CR3")],
    ]);

    const restored = await restoreSortingSession(root, saved);
    const settingsOnly = await restoreSortingSession(root, { ...saved, version: 1 });

    expect(restored).toMatchObject({ kind: "unmoved", targetStep: 2 });
    expect(restored.kind === "unmoved" ? restored.rawFiles.map((file) => file.name) : []).toEqual(["A.CR3"]);
    expect(settingsOnly).toEqual({ kind: "settings", targetStep: 0 });
  });
});
