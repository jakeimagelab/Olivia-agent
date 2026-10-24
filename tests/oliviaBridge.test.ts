import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bridgeFileKind, partitionBridgeFileNames, scanBridgeFolder, updateBridgeSelection } from "@/lib/photo-bridge/bridgeFiles";
import {
  BRIDGE_FLOATING_WINDOW_PRESETS,
  clampBridgeFloatingWindowRect,
  createBridgeFloatingWindowRect,
  moveBridgeFloatingWindowRect,
  resizeBridgeFloatingWindowRect,
} from "@/lib/photo-bridge/floatingWindow";
import { getDesktopShortcutApps, getDockApps, getOliviaAppByRoute } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { DESKTOP_APP_TO_WORKSPACE } from "@/components/olivia-os/useOliviaDesktopContextBridge";

describe("Olivia Bridge", () => {
  it("JPG·RAW·사이드카를 구분하고 숨김·기타 파일은 탐색 대상에서 제외한다", () => {
    expect(bridgeFileKind("IMG_1001.JPG")).toBe("jpg");
    expect(bridgeFileKind("IMG_1001.ARW")).toBe("raw");
    expect(bridgeFileKind("IMG_1001.XMP")).toBe("sidecar");
    expect(bridgeFileKind("._IMG_1001.JPG")).toBe("other");
    expect(partitionBridgeFileNames(["A.JPG", "A.CR3", "A.XMP", "note.txt", ".DS_Store"])).toEqual({
      jpg: ["A.JPG"],
      raw: ["A.CR3"],
      sidecar: ["A.XMP"],
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

  it("폴더 스캔은 JPG·RAW·사이드카 메타데이터와 하위 폴더를 유지한다", async () => {
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
        yield ["IMG_1.XMP", fileHandle("IMG_1.XMP", 4)] as [string, FileSystemHandle];
        yield ["촬영 2일차", child] as [string, FileSystemHandle];
        yield ["._IMG_2.JPG", fileHandle("._IMG_2.JPG", 5)] as [string, FileSystemHandle];
      },
    } as unknown as FileSystemDirectoryHandle;

    const result = await scanBridgeFolder(directory, "테스트/촬영본");

    expect(result.jpgs.map((item) => [item.name, item.size])).toEqual([["IMG_2.JPG", 20]]);
    expect(result.raws.map((item) => [item.name, item.size])).toEqual([["IMG_1.ARW", 40]]);
    expect(result.sidecars.map((item) => [item.name, item.size])).toEqual([["IMG_1.XMP", 4]]);
    expect(result.folders.map((item) => item.name)).toEqual(["촬영 2일차"]);
    expect(result.ignoredCount).toBe(1);
  });

  it("OliviaOS 네이티브 앱과 사진 작업 컨텍스트로 등록된다", () => {
    expect(getOliviaAppByRoute("/olivia-bridge")).toMatchObject({ id: "olivia-bridge", title: "Olivia Bridge" });
    expect(getDesktopShortcutApps().map((app) => app.id)).toContain("olivia-bridge");
    expect(getDesktopShortcutApps().map((app) => app.id)).not.toContain("photo-workspace");
    expect(getDockApps().map((app) => app.id)).toContain("olivia-bridge");
    expect(getDockApps().map((app) => app.id)).not.toContain("photo-workspace");
    expect(DESKTOP_APP_TO_WORKSPACE["olivia-bridge"]).toBe("photo-sort");
  });

  it("Space 전체화면 미리보기는 Bridge 루트 Fullscreen API와 contain 표시를 사용한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(workspace).toContain("root.requestFullscreen()");
    expect(workspace).toContain('document.addEventListener("fullscreenchange"');
    expect(workspace).toContain("document.exitFullscreen()");
    expect(workspace).toContain("Space 전체화면");
    expect(workspace).not.toContain("Space 선택");
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*object-fit:\s*contain/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*width:\s*auto[\s\S]*height:\s*auto/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*max-width:\s*100%[\s\S]*max-height:\s*100%/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*image-orientation:\s*from-image/);
    expect(styles).toContain(".bridge:fullscreen");
  });

  it("기능 창은 Bridge 오른쪽에 열리고 앱 경계 안으로 보정된다", () => {
    const preset = BRIDGE_FLOATING_WINDOW_PRESETS.tool;
    const initial = createBridgeFloatingWindowRect({ width: 1400, height: 900 }, preset);

    expect(initial).toEqual({ x: 462, y: 76, width: 920, height: 700 });
    expect(moveBridgeFloatingWindowRect(initial, 1000, 1000, { width: 1400, height: 900 }, preset)).toEqual({
      x: 462,
      y: 182,
      width: 920,
      height: 700,
    });

    expect(clampBridgeFloatingWindowRect(initial, { width: 600, height: 430 }, preset)).toEqual({
      x: 18,
      y: 18,
      width: 564,
      height: 394,
    });
  });

  it("기능 창은 최소 크기와 Bridge 가용 크기 사이에서 리사이즈된다", () => {
    const preset = BRIDGE_FLOATING_WINDOW_PRESETS.scene;
    const initial = createBridgeFloatingWindowRect({ width: 1200, height: 800 }, preset);

    expect(resizeBridgeFloatingWindowRect(initial, -500, -500, "southeast", { width: 1200, height: 800 }, preset)).toMatchObject({
      width: 420,
      height: 360,
    });
    expect(resizeBridgeFloatingWindowRect(initial, 1000, 1000, "southeast", { width: 1200, height: 800 }, preset)).toEqual({
      x: 482,
      y: 76,
      width: 700,
      height: 706,
    });
  });

  it("Bridge 레이아웃과 내부 도구창은 실제 컨테이너 크기에 반응한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const floatingWindow = readFileSync("components/olivia-bridge/BridgeFloatingWindow.tsx", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(workspace).toContain("<BridgeFloatingWindow");
    expect(floatingWindow).toContain("new ResizeObserver");
    expect(floatingWindow).toContain('beginInteraction(event, "move")');
    expect(floatingWindow).toContain('beginInteraction(event, "southeast")');
    expect(styles).toContain("container: olivia-bridge / size");
    expect(styles).toContain("@container olivia-bridge (max-width: 760px)");
    expect(styles).toContain("cursor: nwse-resize");
  });
});
