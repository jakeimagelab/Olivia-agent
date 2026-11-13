import { describe, expect, it, vi } from "vitest";
import { executePlannedFieldOutput, renameConfirmedFieldScenes } from "@/lib/photo-classifier/fieldOutput";
import type { FieldScene } from "@/lib/photo-classifier/types";

type FakeStoredFile = {
  content: string;
  file: File;
};

class FakeDirectory {
  readonly directories = new Map<string, FakeDirectory>();
  readonly files = new Map<string, FakeStoredFile>();
  readonly removed: string[] = [];

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string) {
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
      createWritable: async () => ({
        write: async (content: string) => { stored.content = content; },
        close: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string) {
    this.removed.push(name);
  }
}

function asDirectory(directory: FakeDirectory) {
  return directory as unknown as FileSystemDirectoryHandle;
}

function makeScene(handle: FileSystemFileHandle): FieldScene {
  return {
    index: 1,
    folderName: "Scene01",
    editedName: "01_상담",
    startTime: 1,
    endTime: 2,
    fileCount: 1,
    files: [{ name: "A.JPG", basename: "A", handle, mtime: 1 }],
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
