import { describe, expect, it } from "vitest";
import { collectJpgFolderGroups } from "@/lib/selectMatch/folderScanner";

type MockEntry = MockDirectory | MockFile;
type MockFile = { kind: "file"; name: string };
type MockDirectory = {
  kind: "directory";
  name: string;
  entries: () => AsyncGenerator<[string, MockEntry]>;
};

function file(name: string): MockFile {
  return { kind: "file", name };
}

function directory(name: string, children: MockEntry[]): MockDirectory {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const child of children) yield [child.name, child];
    },
  };
}

describe("셀렉 & RAW 매칭 폴더 스캔", () => {
  it("scene 이름 규칙 없이 실제 JPG 상위 폴더명으로 그룹화한다", async () => {
    const root = directory("JPG", [
      directory("0.학교세무사", [file("DSC_003.jpg")]),
      directory("0.개인사진", [file("DSC_002.jpeg"), file("DSC_001.JPG"), file("memo.txt")]),
    ]);

    const groups = await collectJpgFolderGroups(root as unknown as FileSystemDirectoryHandle);

    expect(groups.map((group) => group.name)).toEqual(["0.개인사진", "0.학교세무사"]);
    expect(groups[0].photos.map((photo) => photo.name)).toEqual(["DSC_001.JPG", "DSC_002.jpeg"]);
  });

  it("선택한 폴더 바로 안의 JPG도 하나의 그룹으로 수집한다", async () => {
    const root = directory("세무사 홍보포스터 셀렉", [file("A001.jpg"), file("A002.png")]);

    const groups = await collectJpgFolderGroups(root as unknown as FileSystemDirectoryHandle);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("세무사 홍보포스터 셀렉");
    expect(groups[0].photos.map((photo) => photo.basename)).toEqual(["A001", "A002"]);
  });

  it("중첩 폴더를 재귀 탐색하되 설정한 깊이 밖은 제외한다", async () => {
    const root = directory("root", [
      directory("level-1", [
        directory("level-2", [file("inside.jpg")]),
      ]),
    ]);

    expect(await collectJpgFolderGroups(root as unknown as FileSystemDirectoryHandle, 2)).toHaveLength(1);
    expect(await collectJpgFolderGroups(root as unknown as FileSystemDirectoryHandle, 1)).toHaveLength(0);
  });
});
