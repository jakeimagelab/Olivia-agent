import { describe, expect, it, vi } from "vitest";
import { executeStudioOutput } from "@/lib/photo-classifier/studioOutput";

type FakeFile = { content: string };

class FakeDirectory {
  readonly directories = new Map<string, FakeDirectory>();
  readonly files = new Map<string, FakeFile>();
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
    const file = this.files.get(name) ?? { content: "" };
    this.files.set(name, file);
    return {
      createWritable: async () => ({
        write: async (content: string) => { file.content = content; },
        close: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string) {
    this.removed.push(name);
  }
}

function asDirectoryHandle(directory: FakeDirectory) {
  return directory as unknown as FileSystemDirectoryHandle;
}

describe("executeStudioOutput", () => {
  it("copies groups, moves originals when requested, and writes BOM reports", async () => {
    const root = new FakeDirectory("촬영");
    const copied: string[] = [];
    const logs: string[][] = [];
    const progress: number[] = [];

    const result = await executeStudioOutput({
      rootDirectory: asDirectoryHandle(root),
      groups: [{
        folderName: "01_프로필",
        files: [
          { name: "A.JPG", handle: {} as FileSystemFileHandle },
          { name: "B.JPG", handle: {} as FileSystemFileHandle },
        ],
      }],
      reports: [{ name: "summary.json", content: "{}" }],
      mode: "move",
      isCancelled: () => false,
      copyFile: async (_source, _destination, name) => { copied.push(name); },
      onLog: (log) => logs.push(log),
      onProgress: ({ completed }) => progress.push(completed),
    });

    expect(copied).toEqual(["A.JPG", "B.JPG"]);
    expect(root.removed).toEqual(["A.JPG", "B.JPG"]);
    expect(progress).toEqual([0, 1]);
    expect(logs.at(-1)).toHaveLength(2);
    expect(result).toMatchObject({ completed: 2, total: 2 });
    expect(root.directories.get("AI_SELECT_REPORT")?.files.get("summary.json")?.content).toBe("﻿{}");
  });

  it("keeps processing and writes reports when one copy fails", async () => {
    const root = new FakeDirectory("촬영");
    const copied: string[] = [];
    const suppressed = vi.fn();

    const result = await executeStudioOutput({
      rootDirectory: asDirectoryHandle(root),
      groups: [{
        folderName: "01_프로필",
        files: [
          { name: "FAIL.JPG", handle: {} as FileSystemFileHandle },
          { name: "OK.JPG", handle: {} as FileSystemFileHandle },
        ],
      }],
      reports: [{ name: "result.csv", content: "ok" }],
      mode: "copy",
      isCancelled: () => false,
      copyFile: async (_source, _destination, name) => {
        if (name === "FAIL.JPG") throw new Error("copy failed");
        copied.push(name);
      },
      onSuppressedError: suppressed,
    });

    expect(copied).toEqual(["OK.JPG"]);
    expect(result.log).toEqual(["❌ FAIL.JPG 실패", "✅ OK.JPG → 01_프로필/"]);
    expect(root.directories.get("AI_SELECT_REPORT")?.files.has("result.csv")).toBe(true);
    expect(suppressed).not.toHaveBeenCalled();
  });
});
