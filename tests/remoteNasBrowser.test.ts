import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRemoteNasBreadcrumbs,
  joinRemoteNasPath,
  normalizeRemoteNasRelativePath,
  parentRemoteNasPath,
  toRemoteNasDisplayName,
} from "@/lib/remote-nas/path";
import { createMockRemoteNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";

describe("Remote NAS path safety", () => {
  it("keeps safe relative paths inside the NAS root", () => {
    expect(normalizeRemoteNasRelativePath("0819_진보형교수님//JPG/")).toBe("0819_진보형교수님/JPG");
    expect(joinRemoteNasPath("0819_진보형교수님", "JPG")).toBe("0819_진보형교수님/JPG");
    expect(parentRemoteNasPath("0819_진보형교수님/JPG")).toBe("0819_진보형교수님");
    expect(normalizeRemoteNasRelativePath(" 촬영 폴더 /JPG ")).toBe(" 촬영 폴더 /JPG ");
  });

  it.each(["/Volumes/Workstation(M.2SSD)", "../private", "folder/../private", "folder\\private", "bad\0path"])(
    "rejects an unsafe path: %s",
    (path) => expect(() => normalizeRemoteNasRelativePath(path)).toThrow("NAS Root 밖"),
  );

  it("builds raw-path breadcrumbs without losing navigation targets", () => {
    expect(buildRemoteNasBreadcrumbs("0819_진보형교수님/JPG")).toEqual([
      { path: "", label: "Workstation(M.2SSD)", root: true },
      { path: "0819_진보형교수님", label: "0819_진보형교수님", root: false },
      { path: "0819_진보형교수님/JPG", label: "JPG", root: false },
    ]);
  });
});

describe("Remote NAS mock data source", () => {
  const dataSource = createMockRemoteNasDataSource({ delayMs: 0 });

  it("lists the real-world mock root as read-only folders", async () => {
    const result = await dataSource.listFolder("");
    expect(result.rootName).toBe("Workstation(M.2SSD)");
    expect(result.readOnly).toBe(true);
    expect(result.entries).toHaveLength(9);
    expect(result.entries.every((entry) => entry.kind === "directory")).toBe(true);
  });

  it("keeps an NFD raw name while displaying normalized Korean", async () => {
    const result = await dataSource.listFolder("0819_진보형교수님/JPG");
    const normalizedEntry = result.entries.find((entry) => entry.displayName === "진료실_현장_0001.JPG");
    expect(normalizedEntry).toBeDefined();
    expect(normalizedEntry?.name).not.toBe(normalizedEntry?.displayName);
    expect(toRemoteNasDisplayName(normalizedEntry?.name ?? "")).toBe("진료실_현장_0001.JPG");
  });

  it("sorts directories before files and rejects unknown folders", async () => {
    const result = await dataSource.listFolder("0819_진보형교수님/JPG");
    expect(result.entries[0]).toMatchObject({ kind: "directory", displayName: "PREVIEW" });
    await expect(dataSource.listFolder("outside-root")).rejects.toThrow("찾을 수 없습니다");
  });

  it("returns only directories in folder-picker mode, including an empty folder", async () => {
    const result = await dataSource.listFolder("0819_진보형교수님", { foldersOnly: true });
    expect(result.entries.every((entry) => entry.kind === "directory")).toBe(true);

    const empty = await dataSource.listFolder("0911_WINF", { foldersOnly: true });
    expect(empty.entries).toEqual([]);
    expect(empty.path).toBe("0911_WINF");
  });
});

describe("Remote NAS mobile folder selection", () => {
  it("keeps selection independent from navigation and applies only the selected row", () => {
    const browser = readFileSync("components/remote-nas/RemoteNasBrowser.tsx", "utf8");

    expect(browser).toContain("const DOUBLE_TAP_MS = 300");
    expect(browser).toContain("const [selectedFolder, setSelectedFolder]");
    expect(browser).toContain("lastTapRef");
    expect(browser).toContain("handleDirectoryTap(entry)");
    expect(browser).toContain("navigateTo(entry.path)");
    expect(browser).toContain("onSelect?.(selectedFolder.path, selectedFolder)");
    expect(browser).toContain("한 번 탭:");
    expect(browser).toContain("두 번 탭:");
    expect(browser).toContain("formatFolderModifiedAt");
    expect(browser).toContain("visibleFolderCount");
    expect(browser).toContain("setHintVisible(false)");
    expect(browser).toContain("선택한 폴더 적용");
    expect(browser).toContain("disabled={!selectedFolder");
  });

  it("keeps the mobile dock visible below the full-screen remote browser", () => {
    const page = readFileSync("app/remote-files/page.tsx", "utf8");
    const pickerStyles = readFileSync("components/photo-classifier/PhotoSourcePicker.module.css", "utf8");

    expect(page).toContain("MobileBottomNav");
    expect(page).toContain('activeView="home"');
    expect(pickerStyles).toContain("var(--mobile-dock-space");
  });
});
