import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateWindowTileBounds } from "@/lib/olivia/desktop/windowTiling";
import { resetDesktopSession, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";

function open(id: string, zSize = 400) {
  useOliviaDesktopStore.getState().openApp({ appId: id, title: id, width: zSize, height: 300 });
}

describe("Olivia desktop convenience controls", () => {
  beforeEach(() => {
    resetDesktopSession();
    useOliviaDesktopStore.setState({ workspaceWidth: 1200, workspaceHeight: 800, tiledSnapshot: null });
  });

  it("calculates a 2 × 2 grid for four windows", () => {
    expect(calculateWindowTileBounds(4, 1200, 704)).toEqual([
      { x: 0, y: 0, width: 596, height: 348 },
      { x: 604, y: 0, width: 596, height: 348 },
      { x: 0, y: 356, width: 596, height: 348 },
      { x: 604, y: 356, width: 596, height: 348 },
    ]);
  });

  it("gives the final partial row its remaining full width", () => {
    const bounds = calculateWindowTileBounds(3, 1200, 704);
    expect(bounds).toHaveLength(3);
    expect(bounds[2]).toEqual({ x: 0, y: 356, width: 1200, height: 348 });
  });

  it("tiles active windows and restores their precise prior bounds", () => {
    open("one", 360);
    open("two", 410);
    open("three", 470);
    const before = Object.fromEntries(Object.entries(useOliviaDesktopStore.getState().windows).map(([id, win]) => [id, {
      x: win.x, y: win.y, width: win.width, height: win.height,
    }]));

    useOliviaDesktopStore.getState().tileWindows();
    const tiled = useOliviaDesktopStore.getState();
    expect(tiled.tiledSnapshot).toEqual(before);
    expect(tiled.windows.three).toMatchObject({ x: 0, y: 356, width: 1200, height: 348, snapMode: "none" });

    tiled.untileWindows();
    expect(useOliviaDesktopStore.getState().tiledSnapshot).toBeNull();
    for (const [id, bounds] of Object.entries(before)) {
      expect(useOliviaDesktopStore.getState().windows[id]).toMatchObject(bounds);
    }
  });

  it("leaves minimized windows untouched", () => {
    open("one");
    open("two");
    useOliviaDesktopStore.getState().minimizeWindow("two");
    const minimizedBefore = useOliviaDesktopStore.getState().windows.two;

    useOliviaDesktopStore.getState().tileWindows();
    expect(useOliviaDesktopStore.getState().windows.one).toMatchObject({ x: 0, y: 0, width: 1200, height: 704 });
    expect(useOliviaDesktopStore.getState().windows.two).toEqual(minimizedBefore);
  });

  it("drops the restore snapshot after a manual move, new window, or workspace resize", () => {
    open("one");
    useOliviaDesktopStore.getState().tileWindows();
    useOliviaDesktopStore.getState().moveWindow("one", 32, 44);
    expect(useOliviaDesktopStore.getState().tiledSnapshot).toBeNull();

    useOliviaDesktopStore.getState().tileWindows();
    open("two");
    expect(useOliviaDesktopStore.getState().tiledSnapshot).toBeNull();

    useOliviaDesktopStore.getState().tileWindows();
    useOliviaDesktopStore.getState().reconcileWorkspace(1180, 800);
    expect(useOliviaDesktopStore.getState().tiledSnapshot).toBeNull();
  });

  it("keeps the original global search shortcut and shares the conversation store in mini chat", () => {
    const root = process.cwd();
    const search = readFileSync(resolve(root, "components/olivia-os/DesktopGlobalSearch.tsx"), "utf8");
    const miniChat = readFileSync(resolve(root, "components/olivia-os/OliviaMiniChat.tsx"), "utf8");
    const topBar = readFileSync(resolve(root, "components/olivia-os/DesktopTopBar.tsx"), "utf8");
    expect(search).toContain("(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === \"f\"");
    expect(search).toContain("useOliviaDesktopUtilityStore");
    expect(miniChat).toContain("useOliviaConversationStore");
    expect(miniChat).toContain("sendMessage(content)");
    expect(topBar).toContain('const MENU_LABELS: MenuKey[] = ["파일", "보기", "이동", "도움말"]');
  });
});
