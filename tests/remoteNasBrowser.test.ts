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
});
