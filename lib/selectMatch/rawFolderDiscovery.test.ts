import { describe, expect, it } from "vitest";

import type { BridgeRawFolderCandidate } from "@/lib/photo-bridge/recentFolder";
import { discoverRawFolder, representativeRawBasenames } from "@/lib/selectMatch/rawFolderDiscovery";

function file(name: string) {
  return { kind: "file", name } as FileSystemFileHandle;
}

function directory(name: string, fileNames: string[] = []): FileSystemDirectoryHandle {
  const files = new Map(fileNames.map((fileName) => [fileName, file(fileName)]));
  return {
    kind: "directory",
    name,
    async getFileHandle(fileName: string) {
      const handle = files.get(fileName);
      if (!handle) throw new DOMException("없음", "NotFoundError");
      return handle;
    },
    async *entries() {
      for (const entry of files) yield entry as [string, FileSystemHandle];
    },
  } as unknown as FileSystemDirectoryHandle;
}

function candidate(handle: FileSystemDirectoryHandle, distance: 0 | 1 | 2): BridgeRawFolderCandidate {
  return { name: handle.name, handle, distance };
}

describe("Bridge RAW folder discovery", () => {
  it("uses only the first two distinct selected basenames as probes", () => {
    expect(representativeRawBasenames(["IMG_1001.JPG", "img_1001.jpg", "IMG_1002.JPG", "IMG_1003.JPG"])).toEqual([
      "img_1001",
      "img_1002",
    ]);
  });

  it("selects the closest folder that contains both representative RAW files", async () => {
    const current = directory("JPG", []);
    const parent = directory("촬영본", ["IMG_1001.ARW", "IMG_1002.ARW"]);
    const root = directory("2026-10-26_행사", ["IMG_1001.ARW", "IMG_1002.ARW"]);

    const result = await discoverRawFolder({
      candidates: [candidate(current, 0), candidate(parent, 1), candidate(root, 2)],
      selectedNames: ["IMG_1001.JPG", "IMG_1002.JPG", "IMG_1003.JPG"],
    });

    expect(result.candidate?.handle).toBe(parent);
    expect(result.matchedSamples).toBe(2);
    expect(result.attempts.map((attempt) => attempt.name)).toEqual(["JPG", "촬영본"]);
  });

  it("falls back to the closest candidate with the most sample matches", async () => {
    const current = directory("Scene", []);
    const parent = directory("JPG", ["IMG_1001.ARW"]);
    const root = directory("행사", ["IMG_1002.ARW"]);

    const result = await discoverRawFolder({
      candidates: [candidate(current, 0), candidate(parent, 1), candidate(root, 2)],
      selectedNames: ["IMG_1001.JPG", "IMG_1002.JPG"],
    });

    expect(result.candidate?.handle).toBe(parent);
    expect(result.matchedSamples).toBe(1);
  });

  it("returns no candidate when no representative RAW exists", async () => {
    const result = await discoverRawFolder({
      candidates: [candidate(directory("JPG"), 0), candidate(directory("촬영본"), 1)],
      selectedNames: ["IMG_1001.JPG"],
    });

    expect(result.candidate).toBeNull();
    expect(result.matchedSamples).toBe(0);
  });
});
