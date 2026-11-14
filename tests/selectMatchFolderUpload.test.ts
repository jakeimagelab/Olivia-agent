import { describe, expect, it } from "vitest";

import { collectLegacyEntryFiles } from "@/lib/selectMatch/browserFolderUpload";

type TestEntry = Parameters<typeof collectLegacyEntryFiles>[0];

function fileEntry(file: File): TestEntry {
  return {
    isFile: true,
    isDirectory: false,
    file: (success) => success(file),
  };
}

function directoryEntry(batches: TestEntry[][]): TestEntry {
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (success) => success(batches.shift() ?? []),
    }),
  };
}

describe("RAW match customer folder upload", () => {
  it("reads every file from nested folders and every directory-reader batch", async () => {
    const first = new File(["a"], "A_0001.JPG");
    const second = new File(["b"], "A_0002.JPG");
    const third = new File(["c"], "A_0003.JPG");
    const nested = directoryEntry([[fileEntry(second)], [fileEntry(third)], []]);
    const root = directoryEntry([[fileEntry(first), nested], []]);

    await expect(collectLegacyEntryFiles(root)).resolves.toEqual([first, second, third]);
  });
});
