import { describe, expect, it } from "vitest";
import { collectJpgFolderGroups, flattenFolderGroupsToNames } from "@/lib/selectMatch/folderScanner";

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

describe("폴더 선택 모드 — 이름 평탄화", () => {
  it("여러 그룹의 basename을 하나의 Set으로 합치고 소문자로 정규화한다", async () => {
    const root = directory("JPG", [
      directory("A", [file("DSC_0142.JPG")]),
      directory("B", [file("DSC_0200.jpg"), file("DSC_0201.jpeg")]),
    ]);
    const groups = await collectJpgFolderGroups(root as unknown as FileSystemDirectoryHandle);
    const names = flattenFolderGroupsToNames(groups);
    expect(names).toEqual(new Set(["dsc_0142", "dsc_0200", "dsc_0201"]));
  });

  it("빈 그룹 목록에서는 빈 Set을 반환한다", () => {
    expect(flattenFolderGroupsToNames([])).toEqual(new Set());
  });
});
