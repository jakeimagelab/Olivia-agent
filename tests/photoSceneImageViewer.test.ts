import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  canSplitSceneAt,
  clampSceneViewerIndex,
  createSceneViewerObjectUrl,
  formatSceneViewerTime,
  getSceneEdgePreviewItems,
  moveSceneViewerIndex,
} from "@/lib/photo-classifier/sceneViewer";

describe("photo classifier scene image viewer", () => {
  it("shows one start/end preview for a single photo and both edges for a long scene", () => {
    expect(getSceneEdgePreviewItems(1)).toEqual([{ fileIndex: 0, label: "시작·끝" }]);
    expect(getSceneEdgePreviewItems(120)).toEqual([
      { fileIndex: 0, label: "시작" },
      { fileIndex: 119, label: "끝" },
    ]);
  });

  it("keeps arrow navigation inside a 120-photo scene", () => {
    expect(moveSceneViewerIndex(0, -1, 120)).toBe(0);
    expect(moveSceneViewerIndex(0, 1, 120)).toBe(1);
    expect(moveSceneViewerIndex(119, 1, 120)).toBe(119);
    expect(clampSceneViewerIndex(52, 120)).toBe(52);
  });

  it("allows splitting only before the second or later photo", () => {
    expect(canSplitSceneAt(0)).toBe(false);
    expect(canSplitSceneAt(1)).toBe(true);
    expect(canSplitSceneAt(119)).toBe(true);
  });

  it("shows capture time with seconds in the viewer header", () => {
    expect(formatSceneViewerTime(new Date(2026, 10, 18, 12, 26, 14).getTime())).toBe("12:26:14");
  });

  it("revokes the original object URL exactly once when the active photo closes", async () => {
    const file = new Blob(["photo"], { type: "image/jpeg" }) as File;
    const handle = { getFile: vi.fn().mockResolvedValue(file) } as unknown as FileSystemFileHandle;
    const urlApi = {
      createObjectURL: vi.fn().mockReturnValue("blob:scene-original"),
      revokeObjectURL: vi.fn(),
    };

    const resource = await createSceneViewerObjectUrl(handle, urlApi);
    expect(resource.objectUrl).toBe("blob:scene-original");
    resource.revoke();
    resource.revoke();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:scene-original");
  });

  it("generates scene edge thumbnails at 320px", () => {
    const source = readFileSync("lib/photo-classifier/browserFieldClassificationRunner.ts", "utf8");
    expect(source).toContain("handle.getFile(), 320");
    expect(source).not.toContain("handle.getFile(), 160");
  });
});
