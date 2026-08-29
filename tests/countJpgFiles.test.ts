import { describe, expect, it } from "vitest";
import { countJpgFiles } from "@/lib/photo-classifier/countJpgFiles";

// PhotoSortingWorkspace.tsx의 실제 필드 스캔 루프(rootDir.entries(), handle.kind!=="file" 스킵,
// jpg/jpeg 확장자만 카운트, 비재귀)와 동일한 범위로 세는지 확인한다(PHASE 4, 2026-08-30) —
// 채팅 미리보기 숫자가 실제 분류 실행 결과와 어긋나 보이면 안 된다.
type MockEntry = MockDirectory | MockFile;
type MockFile = { kind: "file"; name: string };
type MockDirectory = { kind: "directory"; name: string; entries: () => AsyncGenerator<[string, MockEntry]> };

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

describe("countJpgFiles — 사진 분류 채팅 미리보기용 가벼운 스캔", () => {
  it("jpg/jpeg 확장자만 대소문자 구분 없이 센다", async () => {
    const root = directory("root", [file("A001.jpg"), file("A002.JPG"), file("A003.jpeg"), file("A004.png"), file("readme.txt")]);
    expect(await countJpgFiles(root as unknown as FileSystemDirectoryHandle)).toBe(3);
  });

  it("하위 폴더는 재귀하지 않는다(실제 분류 스캔과 동일한 범위)", async () => {
    const root = directory("root", [
      file("top.jpg"),
      directory("sub", [file("nested.jpg")]),
    ]);
    expect(await countJpgFiles(root as unknown as FileSystemDirectoryHandle)).toBe(1);
  });

  it("빈 폴더는 0을 반환한다", async () => {
    const root = directory("root", []);
    expect(await countJpgFiles(root as unknown as FileSystemDirectoryHandle)).toBe(0);
  });
});
