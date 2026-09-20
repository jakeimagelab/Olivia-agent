import { describe, expect, it } from "vitest";
import {
  findPhotoFolderCandidates,
  resolveSinglePhotoFolderCandidate,
} from "@/lib/photo-storage/photoFolderCatalog";
import type { RemoteNasDataSource, RemoteNasEntry, RemoteNasFolderResult } from "@/lib/remote-nas/types";

function directory(name: string, modifiedAt = "2026-09-19T12:00:00.000Z"): RemoteNasEntry {
  return { kind: "directory", name, path: name, displayName: name.normalize("NFC"), displayPath: name.normalize("NFC"), sizeBytes: null, modifiedAt };
}

function file(parent: string, name: string, sizeBytes: number, modifiedAt = "2026-09-19T12:00:00.000Z"): RemoteNasEntry {
  return { kind: "file", name, path: `${parent}/${name}`, displayName: name, displayPath: `${parent}/${name}`.normalize("NFC"), sizeBytes, modifiedAt };
}

function dataSource(folders: Record<string, RemoteNasEntry[]>): RemoteNasDataSource {
  const rootEntries = Object.keys(folders).map((name) => directory(name));
  return {
    async listFolder(relativePath): Promise<RemoteNasFolderResult> {
      return {
        rootName: "Workstation(M.2SSD)",
        path: relativePath,
        displayPath: relativePath.normalize("NFC"),
        entries: relativePath ? folders[relativePath] ?? [] : rootEntries,
        connection: { macStudio: "online", nas: "connected", source: "worker" },
        readOnly: true,
      };
    },
  };
}

describe("photo folder catalog", () => {
  it("부분 이름 후보를 장수·JPG bytes·전체 용량·수정일과 함께 반환한다", async () => {
    const source = dataSource({
      "0730_르셀청담": [file("0730_르셀청담", "A001.JPG", 100), file("0730_르셀청담", "A001.ARW", 300)],
      "0812_르셀청담": [file("0812_르셀청담", "B001.JPEG", 120, "2026-09-20T01:00:00.000Z")],
      "0911_세무사회": [file("0911_세무사회", "C001.JPG", 80)],
    });

    const result = await findPhotoFolderCandidates("르셀청담", source);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ fileCount: 2, jpgCount: 1, jpgBytes: 100, rawCount: 1, totalBytes: 400 });
    expect(result[1]).toMatchObject({ fileCount: 1, jpgCount: 1, jpgBytes: 120, rawCount: 0, totalBytes: 120, modifiedAt: "2026-09-20T01:00:00.000Z" });
  });

  it("부분 이름 후보가 여러 개면 mutation용 단일 해석을 차단한다", async () => {
    const source = dataSource({
      "0730_르셀청담": [file("0730_르셀청담", "A.JPG", 100)],
      "0812_르셀청담": [file("0812_르셀청담", "B.JPG", 100)],
    });
    await expect(resolveSinglePhotoFolderCandidate("르셀청담", source)).rejects.toMatchObject({ code: "AMBIGUOUS_PHOTO_FOLDER" });
  });

  it("정확한 표시 이름은 NFD raw 상대경로를 보존해 단일 선택한다", async () => {
    const rawName = "0915_포토클리닉".normalize("NFD");
    const source = dataSource({ [rawName]: [file(rawName, "A.JPG", 100)] });
    const result = await resolveSinglePhotoFolderCandidate("0915_포토클리닉", source);
    expect(result.sourceRelativePath).toBe(rawName);
  });

  it("자연어 공백과 실제 폴더 구분자가 달라도 같은 촬영 폴더를 찾는다", async () => {
    const source = dataSource({
      "0918_삼칠갈비": [file("0918_삼칠갈비", "A.JPG", 100)],
    });

    const result = await resolveSinglePhotoFolderCandidate("0918 삼 칠 갈 비", source);

    expect(result).toMatchObject({
      displayName: "0918_삼칠갈비",
      sourceRelativePath: "0918_삼칠갈비",
    });
  });
});
