import { describe, expect, it, vi } from "vitest";

import {
  loadLocalBridgeFolderSnapshot,
  loadRemoteBridgeFolderSnapshot,
} from "@/lib/photo-bridge/folderLoader";
import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

function storageWith(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null };
}

describe("Bridge folder loader", () => {
  it("로컬 폴더 스캔과 저장된 표시값을 하나의 스냅샷으로 만든다", async () => {
    const directory = { name: "JPG" } as FileSystemDirectoryHandle;
    const trail = [
      { name: "촬영", handle: { name: "촬영" } as FileSystemDirectoryHandle },
      { name: "JPG", handle: directory },
    ];
    const scan: BridgeFolderScan = {
      ...EMPTY_SCAN,
      jpgs: [{
        id: "photo-a",
        name: "A.JPG",
        relativeDirectory: "",
        relativePath: "A.JPG",
        extension: "JPG",
        size: 100,
        lastModified: 200,
      }],
    };
    const scanFolder = vi.fn(async () => scan);
    const snapshot = await loadLocalBridgeFolderSnapshot({
      directory,
      trail,
      includeNestedJpgs: true,
      storage: storageWith({
        "olivia-bridge-selection-source:촬영/JPG": "both",
        "olivia-bridge:marks:촬영 / JPG": JSON.stringify({
          ratings: { "photo-a": 5 },
          colorLabels: { "photo-a": 6 },
        }),
      }),
      scanFolder,
    });

    expect(scanFolder).toHaveBeenCalledWith(directory, "촬영 / JPG", {
      includeNestedJpgs: true,
      maxDepth: 5,
    });
    expect(snapshot.selectionSource).toBe("both");
    expect(snapshot.scan).toBe(scan);
    expect(snapshot.marksByName).toEqual({
      ratings: { "A.JPG": 5 },
      colorLabels: { "A.JPG": 6 },
    });
  });

  it("NAS 호출 결과를 현재 경로의 Bridge 사진 스냅샷으로 만든다", async () => {
    const loadThumbnails = vi.fn(async () => ({
      folder: "root/JPG",
      total: 1,
      thumbs: [{
        relativePath: "C1/A.JPG",
        name: "A.JPG",
        size: 100,
        lastModified: 200,
        dataUrl: "data:image/jpeg;base64,AA==",
      }],
    }));
    const snapshot = await loadRemoteBridgeFolderSnapshot({
      selection: { path: "root/JPG", displayPath: "NAS/root/JPG", rootName: "NAS" },
      storage: storageWith({ "olivia-bridge-selection-source:root/JPG": "adobe" }),
      loadThumbnails,
    });

    expect(loadThumbnails).toHaveBeenCalledWith("root/JPG");
    expect(snapshot.selectionSource).toBe("adobe");
    expect(snapshot.total).toBe(1);
    expect(snapshot.jpgs[0]).toMatchObject({
      id: "root/JPG:C1/A.JPG:100:200",
      relativeDirectory: "C1",
      relativePath: "C1/A.JPG",
    });
  });
});
