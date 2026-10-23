import { describe, expect, it } from "vitest";

import { bridgeFileKind, partitionBridgeFileNames, scanBridgeFolder, updateBridgeSelection } from "@/lib/photo-bridge/bridgeFiles";
import { getOliviaAppByRoute } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { DESKTOP_APP_TO_WORKSPACE } from "@/components/olivia-os/useOliviaDesktopContextBridge";

describe("Olivia Bridge", () => {
  it("JPG와 RAW는 구분하고 숨김·기타 파일은 탐색 대상에서 제외한다", () => {
    expect(bridgeFileKind("IMG_1001.JPG")).toBe("jpg");
    expect(bridgeFileKind("IMG_1001.ARW")).toBe("raw");
    expect(bridgeFileKind("._IMG_1001.JPG")).toBe("other");
    expect(partitionBridgeFileNames(["A.JPG", "A.CR3", "note.txt", ".DS_Store"])).toEqual({
      jpg: ["A.JPG"],
      raw: ["A.CR3"],
      other: ["note.txt", ".DS_Store"],
    });
  });

  it("일반·추가·범위 선택을 Bridge 순서대로 계산한다", () => {
    const ids = ["a", "b", "c", "d"];
    const first = updateBridgeSelection({ current: new Set(), orderedIds: ids, clickedId: "b", anchorId: null, additive: false, range: false });
    expect([...first]).toEqual(["b"]);
    const added = updateBridgeSelection({ current: first, orderedIds: ids, clickedId: "d", anchorId: "b", additive: true, range: false });
    expect([...added]).toEqual(["b", "d"]);
    const range = updateBridgeSelection({ current: new Set(), orderedIds: ids, clickedId: "d", anchorId: "b", additive: false, range: true });
    expect([...range]).toEqual(["b", "c", "d"]);
  });

  it("폴더 스캔은 JPG와 RAW 메타데이터만 읽고 하위 폴더를 유지한다", async () => {
    const fileHandle = (name: string, size: number) => ({
      kind: "file",
      name,
      getFile: async () => ({ name, size, lastModified: 1234 }) as File,
    }) as unknown as FileSystemFileHandle;
    const child = { kind: "directory", name: "촬영 2일차" } as FileSystemDirectoryHandle;
    const directory = {
      kind: "directory",
      name: "촬영본",
      async *entries() {
        yield ["IMG_2.JPG", fileHandle("IMG_2.JPG", 20)] as [string, FileSystemHandle];
        yield ["IMG_1.ARW", fileHandle("IMG_1.ARW", 40)] as [string, FileSystemHandle];
        yield ["촬영 2일차", child] as [string, FileSystemHandle];
        yield ["._IMG_2.JPG", fileHandle("._IMG_2.JPG", 5)] as [string, FileSystemHandle];
      },
    } as unknown as FileSystemDirectoryHandle;

    const result = await scanBridgeFolder(directory, "테스트/촬영본");

    expect(result.jpgs.map((item) => [item.name, item.size])).toEqual([["IMG_2.JPG", 20]]);
    expect(result.raws.map((item) => [item.name, item.size])).toEqual([["IMG_1.ARW", 40]]);
    expect(result.folders.map((item) => item.name)).toEqual(["촬영 2일차"]);
    expect(result.ignoredCount).toBe(1);
  });

  it("OliviaOS 네이티브 앱과 사진 작업 컨텍스트로 등록된다", () => {
    expect(getOliviaAppByRoute("/olivia-bridge")?.id).toBe("olivia-bridge");
    expect(DESKTOP_APP_TO_WORKSPACE["olivia-bridge"]).toBe("photo-sort");
  });
});
