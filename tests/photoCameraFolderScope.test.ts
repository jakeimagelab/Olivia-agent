import { describe, expect, it, vi } from "vitest";

import { scanBridgeCameraFolderScope } from "@/lib/photo-bridge/cameraFolderScope";
import { sortBridgeJpgs, type BridgeFolderScan, type BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

class TestDirectory {
  readonly kind = "directory" as const;
  readonly children = new Map<string, TestDirectory>();

  constructor(readonly name: string) {}

  add(directory: TestDirectory) {
    this.children.set(directory.name, directory);
    return this;
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const directory of this.children.values()) {
      yield [directory.name, directory as unknown as FileSystemHandle];
    }
  }
}

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

function photo(parent: TestDirectory, name: string, timestamp: number): BridgeJpgFile {
  return {
    id: `${parent.name}:${name}`,
    name,
    relativeDirectory: "",
    relativePath: name,
    extension: "JPG",
    parentHandle: parent as unknown as FileSystemDirectoryHandle,
    size: 100,
    lastModified: timestamp,
  };
}

describe("카메라 하위 폴더 분류 범위", () => {
  it("JPG전체의 카메라 폴더들을 합치고 중복 파일명을 구분한다", async () => {
    const project = new TestDirectory("0923_전주푸른안과");
    const jpgRoot = new TestDirectory("JPG전체");
    const first = new TestDirectory("100MSDCF");
    const second = new TestDirectory("101MSDCF");
    jpgRoot.add(first).add(second);
    project.add(jpgRoot);
    const scanFolder = vi.fn(async (directory: FileSystemDirectoryHandle) => ({
      ...EMPTY_SCAN,
      jpgs: [photo(directory as unknown as TestDirectory, "IMG_0001.JPG", directory.name === "100MSDCF" ? 1 : 2)],
    }));

    const result = await scanBridgeCameraFolderScope({
      directory: first as unknown as FileSystemDirectoryHandle,
      trail: [project, jpgRoot, first].map((handle) => ({ name: handle.name, handle: handle as unknown as FileSystemDirectoryHandle })),
      folderPath: "0923_전주푸른안과 / JPG전체 / 100MSDCF",
      scanFolder,
    });

    expect(result?.classificationScope?.outputDirectory).toBe(jpgRoot);
    expect(result?.classificationScope?.sourceFolderNames).toEqual(["100MSDCF", "101MSDCF"]);
    expect(result?.jpgs.map((entry) => entry.classificationName)).toEqual([
      "100MSDCF_IMG_0001.JPG",
      "101MSDCF_IMG_0001.JPG",
    ]);
    expect(result?.jpgs.map((entry) => entry.sourceName)).toEqual(["IMG_0001.JPG", "IMG_0001.JPG"]);
    expect(sortBridgeJpgs((result?.jpgs ?? []).map((entry, index) => ({
      ...entry,
      captureTimestamp: index === 0 ? 2_000 : 1_000,
    })), "capture").map((entry) => entry.relativeDirectory)).toEqual(["101MSDCF", "100MSDCF"]);
    expect(scanFolder).toHaveBeenCalledTimes(2);
  });
});
