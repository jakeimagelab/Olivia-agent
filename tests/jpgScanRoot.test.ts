import { describe, expect, it } from "vitest";

import { isJpgSourceFolderName, resolveJpgScanRootDirectory } from "@/lib/selectMatch/jpgScanRoot";

function directory(name: string, children: FileSystemDirectoryHandle[] = []): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const child of children) yield [child.name, child] as [string, FileSystemDirectoryHandle];
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("JPG 스캔 루트", () => {
  it("JPG전체·JPG원본·JPG를 NFC와 대소문자 무시로 구분한다", () => {
    expect(isJpgSourceFolderName("JPG전체")).toBe(true);
    expect(isJpgSourceFolderName("JPG원본".normalize("NFD"))).toBe(true);
    expect(isJpgSourceFolderName("jpg")).toBe(true);
    expect(isJpgSourceFolderName("촬영")).toBe(false);
  });

  it("프로젝트 루트에서는 JPG전체를 가장 먼저 사용한다", async () => {
    const jpg = directory("JPG");
    const all = directory("JPG전체".normalize("NFD"));
    expect(await resolveJpgScanRootDirectory(directory("촬영", [jpg, all]))).toBe(all);
    expect(await resolveJpgScanRootDirectory(jpg)).toBe(jpg);
  });
});
