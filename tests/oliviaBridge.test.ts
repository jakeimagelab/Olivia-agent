import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bridgeFileKind, partitionBridgeFileNames, resolveBridgeToolSelection, scanBridgeFolder, updateBridgeSelection } from "@/lib/photo-bridge/bridgeFiles";
import {
  BRIDGE_FLOATING_WINDOW_PRESETS,
  clampBridgeFloatingWindowRect,
  createBridgeFloatingWindowRect,
  moveBridgeFloatingWindowRect,
  resizeBridgeFloatingWindowRect,
} from "@/lib/photo-bridge/floatingWindow";
import { getDesktopShortcutApps, getDockApps, getOliviaAppByRoute } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { DESKTOP_APP_TO_WORKSPACE } from "@/components/olivia-os/useOliviaDesktopContextBridge";
import {
  mergePhotoToolRatings,
  mergePhotoToolSelectionSources,
  normalizePhotoToolFileKey,
  normalizePhotoToolSelectionNames,
  samePhotoToolSelectionNames,
} from "@/lib/photo-bridge/toolLinkage";
import { matchPersonSelectFileNames } from "@/lib/photo-bridge/personSelectImport";
import { countOliviaBridgeFolderImages } from "@/components/olivia-bridge/useOliviaBridgeFolderCounts";

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

  it("폴더 장수 계산은 보정 전달 폴더를 건너뛰고 JPG·RAW만 센다", async () => {
    const file = (name: string) => ({ name, kind: "file" as const });
    const directory = (name: string, children: Array<{ name: string; kind: "file" | "directory"; entries?: () => AsyncIterableIterator<[string, FileSystemHandle]> }>) => ({
      name,
      kind: "directory" as const,
      async *entries() {
        for (const child of children) yield [child.name, child as unknown as FileSystemHandle] as [string, FileSystemHandle];
      },
    });
    const delivered = directory("1차보정본", [file("OLD.JPG")]);
    const nested = directory("C1", [file("A.JPG"), file("A.CR3"), file("A.XMP")]);
    const root = directory("촬영", [nested, delivered, file("B.JPEG"), file(".hidden.JPG")]);

    await expect(countOliviaBridgeFolderImages(root as unknown as FileSystemDirectoryHandle)).resolves.toBe(3);
  });

  it("일반·추가·범위 선택을 Bridge 순서대로 계산한다", () => {
    const ids = ["a", "b", "c", "d"];
    const first = updateBridgeSelection({ current: new Set(), orderedIds: ids, clickedId: "b", anchorId: null, additive: false, range: false });
    expect([...first]).toEqual(["b"]);
    const added = updateBridgeSelection({ current: first, orderedIds: ids, clickedId: "d", anchorId: "b", additive: true, range: false });
    expect([...added]).toEqual(["b", "d"]);
    const range = updateBridgeSelection({ current: new Set(), orderedIds: ids, clickedId: "d", anchorId: "b", additive: false, range: true });
    expect([...range]).toEqual(["b", "c", "d"]);
    const addedRange = updateBridgeSelection({ current: new Set(["a"]), orderedIds: ids, clickedId: "d", anchorId: "b", additive: true, range: true });
    expect([...addedRange]).toEqual(["a", "b", "c", "d"]);
    const removed = updateBridgeSelection({ current: new Set(["b", "d"]), orderedIds: ids, clickedId: "b", anchorId: "d", additive: true, range: false });
    expect([...removed]).toEqual(["d"]);
  });

  it("명시 선택이 없으면 현재 보이는 JPG 전체를 도구 입력으로 사용한다", () => {
    expect([...resolveBridgeToolSelection(new Set(), ["visible-a", "visible-b"])]).toEqual(["visible-a", "visible-b"]);
    expect([...resolveBridgeToolSelection(new Set(["picked"]), ["visible-a", "visible-b"])]).toEqual(["picked"]);
  });

  it("Command 또는 Ctrl+A로 현재 보이는 JPG 전체 선택을 실행한다", () => {
    const keyboard = readFileSync("components/olivia-bridge/useOliviaBridgeKeyboard.ts", "utf8");
    const actionBar = readFileSync("components/olivia-bridge/OliviaBridgeActionBar.tsx", "utf8");
    expect(keyboard).toContain('(event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyA"');
    expect(keyboard).toContain("selectAllVisibleJpgs()");
    expect(actionBar).toContain("⌘/Ctrl+A 전체 선택");
  });

  it("Bridge와 사진 도구의 파일명·선택·별점을 같은 키로 연결한다", () => {
    expect(normalizePhotoToolFileKey(" 촬영/JPG/IMG_0001.JPG ")).toBe("img_0001");
    expect(normalizePhotoToolSelectionNames(["IMG_0001.JPG", "img_0001.cr3", "IMG_0002.JPG"])).toEqual([
      "IMG_0001.JPG",
      "IMG_0002.JPG",
    ]);
    expect(samePhotoToolSelectionNames(["IMG_0001.JPG"], ["img_0001"])).toBe(true);
    expect([...mergePhotoToolSelectionSources(new Set(["olivia-a", "shared"]), new Set(["adobe-b", "shared"]))]).toEqual([
      "olivia-a",
      "shared",
      "adobe-b",
    ]);

    const fromXmp = mergePhotoToolRatings({ img_0001: 5 }, { "IMG_0001.JPG": 2, "IMG_0002.JPG": 3 });
    expect(fromXmp).toEqual({ img_0001: 5, img_0002: 3 });
    expect(mergePhotoToolRatings(fromXmp, { "IMG_0001.JPG": 0 }, { overwrite: true })).toEqual({ img_0002: 3 });
  });

  it("고객 선택 파일명을 현재 Bridge 폴더와 대조하고 못 찾은 파일을 유지한다", () => {
    expect(matchPersonSelectFileNames(
      ["R5K_0001.JPG", "r5k_0001.jpg", "R5K_0002.JPG", "R5K_9999.JPG"],
      ["R5K_0001.JPG", "R5K_0002.jpeg", "R5K_0003.JPG"],
    )).toEqual({
      fileNames: ["R5K_0001.JPG", "R5K_0002.JPG", "R5K_9999.JPG"],
      total: 3,
      found: 2,
      missing: ["R5K_9999.JPG"],
    });
  });

  it("개인별 사진 셀렉 행사를 Bridge 선택 통로로 불러온다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const personSelectionImport = readFileSync("components/olivia-bridge/useOliviaBridgePersonSelectionImport.ts", "utf8");
    const actionBar = readFileSync("components/olivia-bridge/OliviaBridgeActionBar.tsx", "utf8");
    const dialogs = readFileSync("components/olivia-bridge/OliviaBridgeDialogs.tsx", "utf8");
    expect(actionBar).toContain("고객 선택 불러오기");
    expect(personSelectionImport).toContain('fetch("/api/person-select"');
    expect(personSelectionImport).toContain("/exports/selected");
    expect(personSelectionImport).toContain("지금 선택한 ${manualCount}장이 사라집니다. 계속할까요?");
    expect(personSelectionImport).toContain("setSelectedJpgNames(match.fileNames)");
    expect(workspace).toContain("useOliviaBridgePersonSelectionImport");
    expect(dialogs).toContain("못 찾은 파일");
  });

  it("기능 창의 SVG 닫기 아이콘은 헤더 드래그로 처리하지 않는다", () => {
    const floatingWindow = readFileSync("components/olivia-bridge/BridgeFloatingWindow.tsx", "utf8");
    expect(floatingWindow).toContain("event.target instanceof Element");
    expect(floatingWindow).toContain("onPointerDown={(event) => event.stopPropagation()}");
    expect(floatingWindow).toContain("event.stopPropagation(); onClose();");
  });

  it("Bridge 폴더를 AI 셀렉·JPG 정리·RAW 매칭에 다시 선택 없이 전달한다", () => {
    const embeddedTool = readFileSync("components/photo-workspace/PhotoWorkspace.tsx", "utf8");
    const aiSelect = readFileSync("components/photo-workspace/PhotoSelectWorkspace.tsx", "utf8");
    const aiPanel = readFileSync("components/photo-workspace/AiPhotoSelectPanel.tsx", "utf8");
    const rawMatch = readFileSync("components/photo-workspace/SelectMatchWorkspace.tsx", "utf8");
    const executionContext = readFileSync("components/photo-workspace/PhotoStudioExecutionContext.tsx", "utf8");

    expect(embeddedTool).toContain("bridgeEmbedded");
    expect(embeddedTool).toContain("bridgeLinked");
    expect(aiSelect).toContain("initialFolder={currentLocalFolder}");
    expect(aiPanel).toContain("현재 Bridge 폴더");
    expect(rawMatch).toContain("RAW 원본 폴더를 자동으로 찾습니다");
    expect(rawMatch).toContain("discoverRawFolder");
    expect(executionContext).toContain("rawMatchDefaultFolder");
    expect(executionContext).toContain("rawMatchFolderCandidates");
  });

  it("Scene 검토 결과만 스크롤하고 승인 실행 바는 항상 고정한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const sceneReview = readFileSync("components/olivia-bridge/OliviaBridgeSceneReviewContent.tsx", "utf8");
    const adobeMarks = readFileSync("components/olivia-bridge/useOliviaBridgeAdobeMarks.ts", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(sceneReview).toContain("Scene {selectedScenes.length.toLocaleString");
    expect(adobeMarks).toContain("collectAdobeBridgeMarks");
    expect(sceneReview).toContain("Olivia 또는 Adobe Bridge에서 분류할 JPG를 선택해 주세요.");
    expect(workspace).toContain("rebuildBridgeSceneAnalysis(sceneState.analysis.files.filter");
    expect(sceneReview).toContain("계획 적용하고 Scene 검토");
    expect(workspace).toContain("stageBridgeClassificationPlan");
    expect(sceneReview).toContain("sceneApprovalSummary");
    expect(styles).toMatch(/\.sceneWindow\s*\{\s*grid-template-rows:\s*54px minmax\(0, 1fr\) auto/);
    expect(styles).toMatch(/\.sceneBody\s*\{[^}]*overflow:\s*hidden/);
    expect(styles).toMatch(/\.sceneGrid\s*\{[^}]*overflow:\s*auto/);
  });

  it("승인한 Scene 계획을 사진 분류가 일회 소비하고 기존 검토 단계에 적용한다", () => {
    const context = readFileSync("components/photo-workspace/PhotoStudioExecutionContext.tsx", "utf8");
    const classifier = readFileSync("components/photo-classifier/PhotoSortingWorkspace.tsx", "utf8");

    expect(context).toContain("pendingBridgeClassificationPlanRef.current = null");
    expect(context).toContain("takeBridgeClassificationPlan");
    expect(classifier).toContain("validateBridgeClassificationPlan(plan");
    expect(classifier).toContain("buildFieldScenesFromBridgePlan(plan)");
    expect(classifier).toContain('setClassificationJobState("WAITING_REVIEW")');
    expect(classifier).toContain('setStep(2)');
    expect(classifier).toContain("Bridge 계획 적용됨");
  });

  it("마지막 Bridge 폴더를 기억하고 권한에 따라 자동 복원한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const browserPanel = readFileSync("components/olivia-bridge/OliviaBridgeBrowserPanel.tsx", "utf8");
    const folderRestore = readFileSync("components/olivia-bridge/useOliviaBridgeFolderRestore.ts", "utf8");

    expect(workspace).toContain("saveBridgeFolderTrail(trail)");
    expect(folderRestore).toContain("queryBridgeFolderTrailPermission(trail)");
    expect(browserPanel).toContain("지난 폴더 다시 열기");
    expect(workspace).toContain("bridgeRawMatchDefaultFolder(trail)");
  });

  it("Bridge 폴더 선택은 로컬과 NAS를 고르고 원격 링크도 NAS 폴더를 직접 연다", () => {
    const layout = readFileSync("app/(photo-studio)/layout.tsx", "utf8");
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const dialogs = readFileSync("components/olivia-bridge/OliviaBridgeDialogs.tsx", "utf8");
    const folderRestore = readFileSync("components/olivia-bridge/useOliviaBridgeFolderRestore.ts", "utf8");
    const folderLoader = readFileSync("lib/photo-bridge/folderLoader.ts", "utf8");
    const windowAdapter = readFileSync("components/olivia-os/adapters/OliviaBridgeWindowContent.tsx", "utf8");

    expect(layout).toContain('new Set(["/photo-sorting", "/olivia-bridge"])');
    expect(layout).toContain('!REMOTE_READY_ROUTES.has(pathname)');
    expect(workspace).toContain("openFolderSourceChooser");
    expect(dialogs).toContain("이 Mac의 폴더");
    expect(dialogs).toContain("NAS 폴더");
    expect(workspace).toContain("pickLocalFolder");
    expect(workspace).toContain("pickNasFolder");
    expect(workspace).toContain("void chooseFolder()");
    expect(workspace).toContain("<PhotoSourcePicker");
    expect(dialogs).toContain('aria-label="폴더 선택 닫기"');
    expect(workspace).toMatch(/const chooseFolder[\s\S]*navigate\?\.\("\/olivia-bridge", "Olivia Bridge"[\s\S]*loadDirectory/);
    expect(workspace).toContain("setRemoteFolder(selection)");
    expect(workspace).toContain("setScan(EMPTY_SCAN)");
    expect(workspace).toContain("loadRemoteBridgeFolderSnapshot");
    expect(folderLoader).toContain("loadRemoteBridgeThumbnails");
    expect(workspace).toContain('sp.get("remoteFolder")');
    expect(folderRestore).toContain('setExecutionMode("REMOTE_WORKER")');
    expect(folderRestore).toContain("normalizeRemoteNasRelativePath(remoteFolderQuery)");
    expect(folderRestore).toContain("toRemoteNasDisplayPath(path)");
    expect(workspace).toContain('key === "classification"');
    expect(workspace).toContain("initialRemoteSelection={remoteProjectSelection}");
    expect(workspace).toContain("NAS · {remoteFolder.displayPath}");
    expect(workspace).toContain('sourceScope="person-select"');
    expect(windowAdapter).toContain("DesktopWindowRouteProvider");
    expect(windowAdapter).toContain("routeHref: context?.routeHref");
    expect(windowAdapter).toContain("navigate,");
    expect(windowAdapter).toContain('title: title ?? "Olivia Bridge"');
  });

  it("원격 썸네일은 로컬 File 없이도 Bridge 파일로 분석할 수 있다", () => {
    const bridgeFiles = readFileSync("lib/photo-bridge/bridgeFiles.ts", "utf8");
    expect(bridgeFiles).toContain("handle?: FileSystemFileHandle");
    expect(bridgeFiles).toContain("file?: File");
    expect(bridgeFiles).toContain("thumbnailUrl?: string");
    expect(bridgeFiles).toContain("await fetch(entry.thumbnailUrl)");
  });

  it("NAS 썸네일은 전체 완료를 기다리지 않고 받은 페이지부터 표시한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const browserPanel = readFileSync("components/olivia-bridge/OliviaBridgeBrowserPanel.tsx", "utf8");
    const remoteThumbnails = readFileSync("lib/photo-bridge/remoteThumbnails.ts", "utf8");

    expect(remoteThumbnails).toContain("options.onPage?.");
    expect(workspace).toContain("onProgress: (progress)");
    expect(workspace).toContain("setScan({ ...EMPTY_SCAN, jpgs: progress.jpgs })");
    expect(browserPanel).toContain('scanStatus === "loading" && scan.jpgs.length');
    expect(browserPanel).toContain("NAS 사진을 불러오는 중");
  });

  it("빈 영역 클릭은 선택과 미리보기를 해제한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const browserPanel = readFileSync("components/olivia-bridge/OliviaBridgeBrowserPanel.tsx", "utf8");
    const marqueeSelection = readFileSync("components/olivia-bridge/useOliviaBridgeMarqueeSelection.ts", "utf8");
    const photoNavigation = readFileSync("components/olivia-bridge/useOliviaBridgePhotoNavigation.ts", "utf8");

    expect(photoNavigation).toContain('event.target.closest("[data-bridge-photo-id]")');
    expect(photoNavigation).toContain("if (suppressThumbnailClickRef.current) return;");
    expect(marqueeSelection).toMatch(/session\.started = true;[\s\S]*fileArea\.setPointerCapture\(event\.pointerId\)/);
    expect(photoNavigation).toContain("const handleFileAreaContextMenu");
    expect(browserPanel).toContain("onContextMenu={onFileAreaContextMenu}");
    expect(photoNavigation).toContain("setSelectedIds(new Set())");
    expect(photoNavigation).toContain("setAnchorId(null)");
    expect(photoNavigation).toContain("setFocusedId(null)");
  });

  it("중앙 파일 영역은 남은 높이를 쓰고 좁은 창에서도 같은 필터를 연다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const folderPanel = readFileSync("components/olivia-bridge/OliviaBridgeFolderPanel.tsx", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(styles).toMatch(/\.bridge\[data-desktop-ui="true"\] \.browserPanel\s*\{[^}]*grid-template-rows:\s*46px minmax\(0, 1fr\)/);
    expect(styles).not.toMatch(/\.bridge\[data-desktop-ui="true"\] \.browserPanel\s*\{[^}]*grid-template-rows:\s*46px 36px minmax\(0, 1fr\)/);
    expect(workspace).toContain("styles.nestedJpgPathToggle");
    expect(folderPanel).toContain("styles.nestedJpgToggle");
    expect(workspace).toContain("styles.compactFilterEntry");
    expect(folderPanel).toContain('data-compact-open={compactOpen ? "true" : "false"}');
    expect(styles).toMatch(/\.bridge\[data-desktop-ui="true"\] \.folderPanel\s*\{[^}]*grid-template-rows:\s*38px minmax\(0, 1fr\) auto auto/);
    expect(styles).toMatch(/\.folderPanelScroll\s*\{[^}]*overflow-y:\s*auto/);
    expect(styles).toMatch(/max-width:\s*900px[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\)/);
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
    expect(result.nestedJpgCount).toBe(0);
  });

  it("요청할 때만 하위 폴더 JPG를 재귀 표시하고 RAW·사이드카는 현재 폴더에 한정한다", async () => {
    const fileHandle = (name: string, size: number) => ({
      kind: "file",
      name,
      getFile: async () => ({ name, size, lastModified: 1234 }) as File,
    }) as unknown as FileSystemFileHandle;
    const nested = {
      kind: "directory",
      name: "Scene 1",
      async *entries() {
        yield ["IMG_2.JPG", fileHandle("IMG_2.JPG", 20)] as [string, FileSystemHandle];
        yield ["IMG_2.ARW", fileHandle("IMG_2.ARW", 40)] as [string, FileSystemHandle];
        yield ["IMG_2.XMP", fileHandle("IMG_2.XMP", 4)] as [string, FileSystemHandle];
      },
    } as unknown as FileSystemDirectoryHandle;
    const directory = {
      kind: "directory",
      name: "촬영본",
      async *entries() {
        yield ["IMG_1.JPG", fileHandle("IMG_1.JPG", 10)] as [string, FileSystemHandle];
        yield ["Scene 1", nested] as [string, FileSystemHandle];
      },
    } as unknown as FileSystemDirectoryHandle;

    const direct = await scanBridgeFolder(directory, "촬영본");
    expect(direct.jpgs.map((item) => item.relativePath)).toEqual(["IMG_1.JPG"]);

    const recursive = await scanBridgeFolder(directory, "촬영본", { includeNestedJpgs: true });
    expect(recursive.jpgs.map((item) => item.relativePath)).toEqual(["IMG_1.JPG", "Scene 1/IMG_2.JPG"]);
    expect(recursive.nestedJpgCount).toBe(1);
    expect(recursive.raws).toHaveLength(0);
    expect(recursive.sidecars).toHaveLength(0);
  });

  it("OliviaOS 네이티브 앱과 사진 작업 컨텍스트로 등록된다", () => {
    expect(getOliviaAppByRoute("/olivia-bridge")).toMatchObject({ id: "olivia-bridge", title: "Olivia Bridge" });
    expect(getDesktopShortcutApps().map((app) => app.id)).toContain("olivia-bridge");
    expect(getDesktopShortcutApps().map((app) => app.id)).not.toContain("photo-workspace");
    expect(getDockApps().map((app) => app.id)).toContain("olivia-bridge");
    expect(getDockApps().map((app) => app.id)).not.toContain("photo-workspace");
    expect(getOliviaAppByRoute("/photo-sorting")).toMatchObject({ id: "photo-workspace" });
    expect(DESKTOP_APP_TO_WORKSPACE["olivia-bridge"]).toBe("photo-sort");
  });

  it("Space 미리보기는 브라우저 전체화면 대신 Olivia OS 창 내부와 contain 표시를 사용한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const actionBar = readFileSync("components/olivia-bridge/OliviaBridgeActionBar.tsx", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(workspace).not.toContain("requestFullscreen");
    expect(workspace).not.toContain("fullscreenchange");
    expect(workspace).not.toContain("exitFullscreen");
    expect(actionBar).toContain("Space OS 창 미리보기");
    expect(actionBar).not.toContain("Space 선택");
    expect(actionBar).toContain("1–5 별점 · 0 해제");
    expect(actionBar).toContain("6–9 컬러 · 같은 키 해제");
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*object-fit:\s*contain/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*width:\s*auto[\s\S]*height:\s*auto/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*max-width:\s*100%[\s\S]*max-height:\s*100%/);
    expect(styles).toMatch(/\.fullscreenPreview\s*>\s*img[\s\S]*image-orientation:\s*from-image/);
    expect(styles).not.toContain(".bridge:fullscreen");
    expect(styles).toContain(".fullscreenLabelBar");
  });

  it("Option Command 레이블 필터와 전체 보기 단축키를 제공한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const actionBar = readFileSync("components/olivia-bridge/OliviaBridgeActionBar.tsx", "utf8");
    const shortcutHook = readFileSync("lib/photo-bridge/useBridgeSearchFilterShortcuts.ts", "utf8");

    expect(workspace).toContain("useBridgeSearchFilterShortcuts");
    expect(workspace).toContain("handleSearchFilterShortcut(event)");
    expect(shortcutHook).toContain("event.altKey && (event.metaKey || event.ctrlKey) && !event.shiftKey");
    expect(shortcutHook).toContain("bridgeLabelFilterCommandFromShortcutCode(event.code)");
    expect(actionBar).toContain("⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색");
    expect(workspace).toContain("setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS })");
    expect(workspace).toContain('setFileFilter("all")');
  });

  it("Command +/-와 하단 게이지로 썸네일 크기를 조절한다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const keyboard = readFileSync("components/olivia-bridge/useOliviaBridgeKeyboard.ts", "utf8");
    const folderPanel = readFileSync("components/olivia-bridge/OliviaBridgeFolderPanel.tsx", "utf8");
    const styles = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");

    expect(keyboard).toContain("event.metaKey && !event.altKey && !event.ctrlKey");
    expect(keyboard).toContain('event.code === "Equal"');
    expect(keyboard).toContain('event.code === "Minus"');
    expect(keyboard).toContain("resizeThumbnails(1)");
    expect(keyboard).toContain("resizeThumbnails(-1)");
    expect(folderPanel).toContain('type="range"');
    expect(workspace).toContain("thumbnailMin={THUMBNAIL_SIZE_MIN}");
    expect(workspace).toContain("thumbnailMax={THUMBNAIL_SIZE_MAX}");
    expect(folderPanel).toContain("⌘ + / -");
    expect(styles).toContain(".thumbnailGauge");
    expect(styles).toContain("::-webkit-slider-thumb");
    expect(styles).toContain("::-moz-range-thumb");
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
