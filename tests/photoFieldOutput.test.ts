import { describe, expect, it, vi } from "vitest";
import {
  executePlannedFieldOutput,
  renameConfirmedFieldScenes,
  sanitizeFieldSceneFolderName,
} from "@/lib/photo-classifier/fieldOutput";
import type { FieldScene } from "@/lib/photo-classifier/types";

type FakeStoredFile = {
  content: string;
  file: File;
};

class FakeDirectory {
  readonly kind = "directory";
  readonly directories = new Map<string, FakeDirectory>();
  readonly files = new Map<string, FakeStoredFile>();
  readonly removed: string[] = [];
  readonly failedDirectoryNames = new Set<string>();
  failWrites = false;

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string) {
    if (this.failedDirectoryNames.has(name)) throw new Error(`cannot create ${name}`);
    const existing = this.directories.get(name);
    if (existing) return existing;
    const created = new FakeDirectory(name);
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string) {
    const stored = this.files.get(name) ?? {
      content: "",
      file: { name, size: 1 } as File,
    };
    this.files.set(name, stored);
    return {
      getFile: async () => stored.file,
      createWritable: async () => {
        if (this.failWrites) throw new Error(`cannot write ${name}`);
        return {
          write: async (content: string) => { stored.content = content; },
          close: async () => undefined,
        };
      },
    };
  }

  async removeEntry(name: string) {
    this.removed.push(name);
    this.files.delete(name);
    this.directories.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, directory] of this.directories) {
      yield [name, directory as unknown as FileSystemDirectoryHandle];
    }
    for (const name of this.files.keys()) {
      yield [name, { kind: "file", name } as FileSystemFileHandle];
    }
  }
}

function asDirectory(directory: FakeDirectory) {
  return directory as unknown as FileSystemDirectoryHandle;
}

function makeScene(
  handle: FileSystemFileHandle,
  editedName = "01_상담",
  fileName = "A.JPG",
  index = 1,
): FieldScene {
  return {
    index,
    folderName: `Scene${String(index).padStart(2, "0")}`,
    editedName,
    startTime: 1,
    endTime: 2,
    fileCount: 1,
    files: [{ name: fileName, basename: fileName.replace(/\.[^.]+$/u, ""), handle, mtime: 1 }],
    sceneDir: null,
    sceneType: "consultation",
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
  };
}

describe("field output", () => {
  it("sanitizes forbidden folder characters and supplies a stable fallback name", () => {
    expect(sanitizeFieldSceneFolderName("상담/원장:*?\"<>|. ", 0)).toBe("상담_원장_______");
    expect(sanitizeFieldSceneFolderName("... ", 1)).toBe("Scene_02");
  });

  it("moves planned RAW and JPG files, writes reports, and returns destination handles", async () => {
    const root = new FakeDirectory("촬영");
    const sourceJpg = {} as FileSystemFileHandle;
    const copied: string[] = [];
    const clearCheckpoint = vi.fn().mockResolvedValue(undefined);

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(root),
      scenes: [makeScene(sourceJpg)],
      rawFiles: [{ name: "A.CR3", handle: {} as FileSystemFileHandle }],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "shoot:dermatology:3:precise-v2",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        copied.push(name);
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async (file) => `thumb:${file.name}`,
      clearCheckpoint,
      now: () => "2026-11-13T00:00:00.000Z",
    });

    expect(copied).toEqual(["A.CR3", "A.JPG"]);
    expect(root.removed).toEqual(["A.CR3", "A.JPG"]);
    expect(result).toMatchObject({ totalFiles: 1 });
    expect(result.operations.map((operation) => operation.status)).toEqual(["completed", "completed"]);
    expect(result.scenes[0]).toMatchObject({ folderName: "01_상담", files: [{ thumbUrl: "thumb:A.JPG" }] });
    expect(root.directories.get("SELECT")?.directories.has("JPG_SELECT")).toBe(true);
    expect(root.directories.get("REPORT")?.files.get("scene_boundaries.json")?.content).toContain("﻿");
    expect(root.directories.get("REPORT")?.files.has("file_operation_journal.json")).toBe(true);
    expect(clearCheckpoint).toHaveBeenCalledWith("shoot:dermatology:3:precise-v2");
  });

  it("keeps the original JPG handle and records a failed operation when copying fails", async () => {
    const root = new FakeDirectory("촬영");
    const sourceJpg = {} as FileSystemFileHandle;
    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(root),
      scenes: [makeScene(sourceJpg)],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "checkpoint",
      isCancelled: () => false,
      copyFile: async (_source, _destination, name) => {
        if (name === "A.JPG") throw new Error("copy failed");
      },
      clearCheckpoint: async () => undefined,
    });

    expect(result.operations).toEqual([expect.objectContaining({
      category: "JPG",
      source: "A.JPG",
      status: "failed",
      error: "copy failed",
    })]);
    expect(result.scenes[0].files[0].handle).toBe(sourceJpg);
    expect(root.removed).not.toContain("A.JPG");
  });

  it("카메라 하위 폴더 원본을 JPG전체 바로 아래 Scene으로 옮긴다", async () => {
    const jpgRoot = new FakeDirectory("JPG전체");
    const cameraFolder = new FakeDirectory("100MSDCF");
    jpgRoot.directories.set(cameraFolder.name, cameraFolder);
    await cameraFolder.getFileHandle("IMG_0001.JPG");
    const sourceJpg = {} as FileSystemFileHandle;
    const scene = makeScene(sourceJpg, "01_상담", "100MSDCF_IMG_0001.JPG");
    scene.files[0] = {
      ...scene.files[0],
      sourceDirectory: asDirectory(cameraFolder),
      sourceName: "IMG_0001.JPG",
      relativePath: "100MSDCF/IMG_0001.JPG",
    };

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(jpgRoot),
      scenes: [scene],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "camera-scope",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async () => null,
      clearCheckpoint: async () => undefined,
    });

    expect(jpgRoot.directories.has("01_상담")).toBe(true);
    expect(jpgRoot.directories.has("JPG")).toBe(false);
    expect(jpgRoot.directories.has("100MSDCF")).toBe(false);
    expect(cameraFolder.removed).toEqual(["IMG_0001.JPG"]);
    expect(result.removedSourceFolders).toEqual(["100MSDCF"]);
    expect(result.operations).toEqual([expect.objectContaining({
      source: "100MSDCF/IMG_0001.JPG",
      destination: "01_상담/100MSDCF_IMG_0001.JPG",
      status: "completed",
    })]);
  });

  it("카메라 폴더에 XMP 등 다른 파일이 남으면 폴더를 보존한다", async () => {
    const jpgRoot = new FakeDirectory("JPG전체");
    const cameraFolder = new FakeDirectory("100MSDCF");
    jpgRoot.directories.set(cameraFolder.name, cameraFolder);
    await cameraFolder.getFileHandle("IMG_0001.JPG");
    await cameraFolder.getFileHandle("IMG_0001.XMP");
    const scene = makeScene({} as FileSystemFileHandle, "01_상담", "IMG_0001.JPG");
    scene.files[0] = {
      ...scene.files[0],
      sourceDirectory: asDirectory(cameraFolder),
      sourceName: "IMG_0001.JPG",
      relativePath: "100MSDCF/IMG_0001.JPG",
    };

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(jpgRoot),
      scenes: [scene],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "camera-sidecar",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async () => null,
      clearCheckpoint: async () => undefined,
    });

    expect(jpgRoot.directories.has("100MSDCF")).toBe(true);
    expect(cameraFolder.files.has("IMG_0001.XMP")).toBe(true);
    expect(result.removedSourceFolders).toEqual([]);
  });

  it("빈 카메라 하위 폴더 구조를 아래에서부터 정리한다", async () => {
    const jpgRoot = new FakeDirectory("JPG전체");
    const cameraFolder = new FakeDirectory("100MSDCF");
    const nestedFolder = new FakeDirectory("DAY_01");
    jpgRoot.directories.set(cameraFolder.name, cameraFolder);
    cameraFolder.directories.set(nestedFolder.name, nestedFolder);
    await nestedFolder.getFileHandle("IMG_0001.JPG");
    const scene = makeScene({} as FileSystemFileHandle, "01_상담", "IMG_0001.JPG");
    scene.files[0] = {
      ...scene.files[0],
      sourceDirectory: asDirectory(nestedFolder),
      sourceName: "IMG_0001.JPG",
      relativePath: "100MSDCF/DAY_01/IMG_0001.JPG",
    };

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(jpgRoot),
      scenes: [scene],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "camera-nested",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async () => null,
      clearCheckpoint: async () => undefined,
    });

    expect(jpgRoot.directories.has("100MSDCF")).toBe(false);
    expect(cameraFolder.removed).toContain("DAY_01");
    expect(result.removedSourceFolders).toEqual(["100MSDCF/DAY_01", "100MSDCF"]);
  });

  it("이동에 실패한 JPG가 남으면 카메라 폴더를 보존한다", async () => {
    const jpgRoot = new FakeDirectory("JPG전체");
    const cameraFolder = new FakeDirectory("100MSDCF");
    jpgRoot.directories.set(cameraFolder.name, cameraFolder);
    await cameraFolder.getFileHandle("IMG_0001.JPG");
    const scene = makeScene({} as FileSystemFileHandle, "01_상담", "IMG_0001.JPG");
    scene.files[0] = {
      ...scene.files[0],
      sourceDirectory: asDirectory(cameraFolder),
      sourceName: "IMG_0001.JPG",
      relativePath: "100MSDCF/IMG_0001.JPG",
    };

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(jpgRoot),
      scenes: [scene],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "camera-failed",
      isCancelled: () => false,
      copyFile: async () => { throw new Error("copy failed"); },
      clearCheckpoint: async () => undefined,
    });

    expect(jpgRoot.directories.has("100MSDCF")).toBe(true);
    expect(cameraFolder.files.has("IMG_0001.JPG")).toBe(true);
    expect(result.removedSourceFolders).toEqual([]);
    expect(result.operations).toEqual([expect.objectContaining({ status: "failed", error: "copy failed" })]);
  });

  it("keeps organizing files when journal, final reports, and checkpoint cleanup fail", async () => {
    const root = new FakeDirectory("촬영");
    const report = await root.getDirectoryHandle("REPORT");
    report.failWrites = true;
    const suppressed = vi.fn();

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(root),
      scenes: [makeScene({} as FileSystemFileHandle)],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "checkpoint",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async () => null,
      clearCheckpoint: async () => { throw new Error("checkpoint unavailable"); },
      onSuppressedError: suppressed,
    });

    expect(result.operations).toEqual([expect.objectContaining({ source: "A.JPG", status: "completed" })]);
    expect(root.removed).toContain("A.JPG");
    expect(suppressed).toHaveBeenCalledWith(expect.any(Error));
  });

  it("records a scene-directory failure and continues with later scenes", async () => {
    const root = new FakeDirectory("촬영");
    const jpg = await root.getDirectoryHandle("JPG");
    jpg.failedDirectoryNames.add("차단");
    const copied: string[] = [];

    const result = await executePlannedFieldOutput({
      rootDirectory: asDirectory(root),
      scenes: [
        makeScene({} as FileSystemFileHandle, "상담/원장. ", "A.JPG", 1),
        makeScene({} as FileSystemFileHandle, "차단", "B.JPG", 2),
        makeScene({} as FileSystemFileHandle, "마지막", "C.JPG", 3),
      ],
      rawFiles: [],
      boundaryDecisions: [],
      sceneCorrections: [],
      accuracyReport: null,
      checkpointId: "checkpoint",
      isCancelled: () => false,
      copyFile: async (_source, destination, name) => {
        copied.push(name);
        await destination.getFileHandle(name, { create: true });
      },
      thumbnailLoader: async () => null,
      clearCheckpoint: async () => undefined,
    });

    expect(copied).toEqual(["A.JPG", "C.JPG"]);
    expect(jpg.directories.has("상담_원장")).toBe(true);
    expect(jpg.directories.has("마지막")).toBe(true);
    expect(result.operations).toEqual([
      expect.objectContaining({ source: "A.JPG", status: "completed" }),
      expect.objectContaining({
        source: "B.JPG",
        status: "failed",
        error: "씬 폴더 생성 실패: cannot create 차단",
      }),
      expect.objectContaining({ source: "C.JPG", status: "completed" }),
    ]);
    expect(root.removed).toEqual(["A.JPG", "C.JPG"]);
  });

  it("renames confirmed scene folders and refreshes every file handle", async () => {
    const oldDirectory = new FakeDirectory("Scene01");
    const newDirectory = new FakeDirectory("01_상담");
    const sourceHandle = {} as FileSystemFileHandle;
    const renamed = await renameConfirmedFieldScenes({
      scenes: [{ ...makeScene(sourceHandle), sceneDir: asDirectory(oldDirectory) }],
      jpgBaseDirectory: asDirectory(new FakeDirectory("JPG")),
      renameDirectory: async () => asDirectory(newDirectory),
    });

    expect(renamed[0].folderName).toBe("01_상담");
    expect(renamed[0].sceneDir).toBe(asDirectory(newDirectory));
    expect(renamed[0].files[0].handle).not.toBe(sourceHandle);
  });
});
