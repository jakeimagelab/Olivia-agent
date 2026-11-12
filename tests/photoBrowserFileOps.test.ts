import { describe, expect, it, vi } from "vitest";

import {
  isSameDirectoryHandle,
  splitRawAndJpg,
  withTimeout,
} from "@/lib/photo-classifier/browserFileOps";
import {
  estimatedRemaining,
  formatTime,
  makeCSV,
} from "@/lib/photo-classifier/workspaceFormatting";

function fileHandle(file: File) {
  return {
    kind: "file",
    name: file.name,
    getFile: async () => file,
  } as unknown as FileSystemFileHandle;
}

describe("photo browser file operations", () => {
  it("splits RAW and JPG files while ignoring hidden and unsupported entries", async () => {
    const raw = fileHandle(new File(["raw"], "IMG_0001.CR3", { lastModified: 10 }));
    const jpgFile = new File(["jpg"], "IMG_0001.JPG", { lastModified: 20 });
    const jpg = fileHandle(jpgFile);
    const directory = {
      async *entries() {
        yield [".DS_Store", fileHandle(new File(["x"], ".DS_Store"))];
        yield ["IMG_0001.CR3", raw];
        yield ["IMG_0001.JPG", jpg];
        yield ["notes.txt", fileHandle(new File(["note"], "notes.txt"))];
      },
    } as unknown as FileSystemDirectoryHandle;

    const result = await splitRawAndJpg(directory);

    expect(result.rawFiles.map((entry) => entry.name)).toEqual(["IMG_0001.CR3"]);
    expect(result.jpgFiles).toMatchObject([{ name: "IMG_0001.JPG", mtime: 20, fileSize: 3 }]);
  });

  it("uses native directory identity when handles are not reference-equal", async () => {
    const right = {} as FileSystemDirectoryHandle;
    const left = { isSameEntry: vi.fn(async () => true) } as unknown as FileSystemDirectoryHandle;

    expect(await isSameDirectoryHandle(left, right)).toBe(true);
    expect(left === right).toBe(false);
  });

  it("rejects work that exceeds its timeout", async () => {
    await expect(withTimeout(new Promise(() => undefined), 1, "테스트")).rejects.toThrow("테스트 시간 초과");
  });
});

describe("photo workspace formatting", () => {
  it("escapes CSV values", () => {
    expect(makeCSV(["name", "memo"], [["A", "say \"hi\""]])).toBe('"name","memo"\n"A","say ""hi"""');
  });

  it("formats local time and remaining duration", () => {
    const time = new Date(2026, 0, 1, 9, 5).getTime();
    expect(formatTime(time)).toBe("09:05");
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    expect(estimatedRemaining(2, 4, 0)).toBe(" · 약 10초 남음");
    vi.restoreAllMocks();
  });
});
