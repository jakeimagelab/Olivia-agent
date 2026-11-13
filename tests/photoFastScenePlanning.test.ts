import { describe, expect, it } from "vitest";
import {
  buildFastFieldScenes,
  buildFastSceneRanges,
} from "@/lib/photo-classifier/scene-builder";
import type { SceneFile } from "@/lib/photo-classifier/types";

function file(name: string, mtime: number): SceneFile {
  return {
    name,
    basename: name.replace(/\.[^.]+$/u, ""),
    handle: {} as FileSystemFileHandle,
    mtime,
    thumbUrl: null,
  };
}

describe("fast scene planning", () => {
  it("uses the shared five-minute minimum gap", () => {
    const files = [
      { mtime: 0 },
      { mtime: 4 * 60_000 },
      { mtime: 10 * 60_000 },
    ];

    expect(buildFastSceneRanges(files, 1)).toEqual([
      expect.objectContaining({ index: 1, startIndex: 0, endIndex: 2, folderName: "Scene01" }),
      expect.objectContaining({ index: 2, startIndex: 2, endIndex: 3, folderName: "Scene02" }),
    ]);
  });

  it("builds browser scenes without losing file order or loading state", () => {
    const scenes = buildFastFieldScenes([
      file("A.JPG", 0),
      file("B.JPG", 60_000),
      file("C.JPG", 11 * 60_000),
    ], 5, { nameLoading: true });

    expect(scenes.map((scene) => scene.files.map((item) => item.name))).toEqual([
      ["A.JPG", "B.JPG"],
      ["C.JPG"],
    ]);
    expect(scenes.map((scene) => scene.nameLoading)).toEqual([true, true]);
    expect(scenes.map((scene) => scene.folderName)).toEqual(["Scene01", "Scene02"]);
  });

  it("returns no scenes for an empty folder", () => {
    expect(buildFastSceneRanges([], 5)).toEqual([]);
    expect(buildFastFieldScenes([], 5)).toEqual([]);
  });
});
