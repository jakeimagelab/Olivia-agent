import { describe, expect, it, vi } from "vitest";

import { bridgeGridNavigationTarget, type BridgeGridItem } from "@/lib/photo-bridge/gridNavigation";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  queryBridgeFolderTrailPermission,
  requestBridgeFolderTrailPermission,
  type BridgeFolderTrailItem,
} from "@/lib/photo-bridge/recentFolder";

function grid(columns: number, count: number): BridgeGridItem[] {
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `photo-${index}`,
      left: column * 110,
      right: column * 110 + 100,
      top: row * 90,
      bottom: row * 90 + 80,
    };
  });
}

function folder(name: string, permission: "granted" | "prompt" | "denied" = "granted") {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => "granted" as const),
  } as unknown as FileSystemDirectoryHandle;
}

describe("Olivia Bridge grid keyboard navigation", () => {
  it("moves left and right to adjacent photos", () => {
    const items = grid(3, 6);
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-1", direction: "left" })).toBe("photo-0");
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-1", direction: "right" })).toBe("photo-2");
  });

  it("moves up and down in the nearest visual column", () => {
    const items = grid(3, 6);
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-1", direction: "down" })).toBe("photo-4");
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-4", direction: "up" })).toBe("photo-1");
  });

  it("uses the nearest available column in a short final row", () => {
    const items = grid(4, 6);
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-3", direction: "down" })).toBe("photo-5");
  });

  it("does not wrap at grid edges and starts on the first photo without focus", () => {
    const items = grid(3, 6);
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-1", direction: "up" })).toBe("photo-1");
    expect(bridgeGridNavigationTarget({ items, currentId: "photo-4", direction: "down" })).toBe("photo-4");
    expect(bridgeGridNavigationTarget({ items, currentId: null, direction: "down" })).toBe("photo-0");
  });
});

describe("Olivia Bridge remembered folders", () => {
  it("uses the direct parent as the RAW default only when the breadcrumb is known", () => {
    const root = folder("촬영본");
    const jpg = folder("JPG");
    const trail: BridgeFolderTrailItem[] = [{ name: root.name, handle: root }, { name: jpg.name, handle: jpg }];
    expect(bridgeRawMatchDefaultFolder(trail)).toBe(root);
    expect(bridgeRawMatchDefaultFolder([{ name: jpg.name, handle: jpg }])).toBeNull();
  });

  it("offers only the current folder and up to two known ancestors for RAW discovery", () => {
    const root = folder("2026-10-26_행사");
    const day = folder("촬영본");
    const jpg = folder("JPG");
    const scene = folder("Scene 1");
    const trail: BridgeFolderTrailItem[] = [root, day, jpg, scene].map((handle) => ({ name: handle.name, handle }));

    expect(bridgeRawMatchFolderCandidates(trail).map((item) => [item.name, item.distance])).toEqual([
      ["Scene 1", 0],
      ["JPG", 1],
      ["촬영본", 2],
    ]);
  });

  it("distinguishes automatic restore from permission-required restore", async () => {
    const granted = folder("촬영본", "granted");
    const prompt = folder("JPG", "prompt");
    expect(await queryBridgeFolderTrailPermission([{ name: granted.name, handle: granted }])).toBe("granted");
    expect(await queryBridgeFolderTrailPermission([{ name: prompt.name, handle: prompt }])).toBe("prompt");
  });

  it("requests permission from the saved root before restoring", async () => {
    const root = folder("촬영본", "granted");
    const trail = [{ name: root.name, handle: root }];
    expect(await requestBridgeFolderTrailPermission(trail)).toBe("granted");
    expect((root as any).requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });
});
