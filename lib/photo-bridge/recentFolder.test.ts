import { describe, expect, it } from "vitest";

import {
  bridgeRawMatchFolderCandidates,
  resolveBridgeFolderTrail,
} from "@/lib/photo-bridge/recentFolder";

function folder(name: string): FileSystemDirectoryHandle {
  return { kind: "directory", name } as FileSystemDirectoryHandle;
}

describe("Bridge folder trail resolution", () => {
  it("rebuilds the current, parent, and two-level parent RAW search candidates", async () => {
    const current = folder("사진");
    const jpgRoot = {
      ...folder("JPG전체"),
      async getDirectoryHandle(name: string) {
        if (name !== "사진") throw new DOMException("없음", "NotFoundError");
        return current;
      },
    } as FileSystemDirectoryHandle;
    const shootRoot = {
      ...folder("1024_지관서가"),
      async resolve(candidate: FileSystemHandle) {
        return candidate === current ? ["JPG전체", "사진"] : null;
      },
      async getDirectoryHandle(name: string) {
        if (name !== "JPG전체") throw new DOMException("없음", "NotFoundError");
        return jpgRoot;
      },
    } as FileSystemDirectoryHandle;

    const trail = await resolveBridgeFolderTrail(shootRoot, current);

    expect(trail?.map((item) => item.name)).toEqual(["1024_지관서가", "JPG전체", "사진"]);
    expect(bridgeRawMatchFolderCandidates(trail ?? []).map((item) => [item.name, item.distance])).toEqual([
      ["사진", 0],
      ["JPG전체", 1],
      ["1024_지관서가", 2],
    ]);
  });

  it("rejects a selected folder that does not contain the current photo folder", async () => {
    const current = folder("사진");
    const unrelated = {
      ...folder("다른 촬영"),
      async resolve() { return null; },
    } as FileSystemDirectoryHandle;

    await expect(resolveBridgeFolderTrail(unrelated, current)).resolves.toBeNull();
  });
});
