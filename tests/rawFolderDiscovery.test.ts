import { describe, expect, it } from "vitest";

import { discoverRawFolder } from "@/lib/selectMatch/rawFolderDiscovery";
import { buildRawIndex, shouldSkipRawScanDirectory } from "@/lib/selectMatch/rawIndex";

function rawFile(name: string): FileSystemFileHandle {
  return { name, kind: "file", getFile: async () => new File(["raw"], name) } as unknown as FileSystemFileHandle;
}

function directory(input: {
  name: string;
  files?: Record<string, FileSystemFileHandle>;
  directories?: Record<string, FileSystemDirectoryHandle>;
  hangEntries?: boolean;
}): FileSystemDirectoryHandle {
  return {
    name: input.name,
    kind: "directory",
    getFileHandle: async (name: string) => {
      const file = input.files?.[name];
      if (!file) throw new DOMException("Not found", "NotFoundError");
      return file;
    },
    entries: () => {
      if (input.hangEntries) {
        return {
          [Symbol.asyncIterator]() { return this; },
          next: () => new Promise<IteratorResult<[string, FileSystemHandle]>>(() => undefined),
        } as AsyncIterableIterator<[string, FileSystemHandle]>;
      }
      const values: Array<[string, FileSystemHandle]> = [
        ...Object.entries(input.directories ?? {}),
        ...Object.entries(input.files ?? {}),
      ];
      return (async function* entries() { yield* values; })();
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("RAW 폴더 자동 탐색", () => {
  it("JPG/JPG원본 후보는 대소문자와 유니코드 정규화와 무관하게 건너뛴다", async () => {
    expect(shouldSkipRawScanDirectory("JPG")).toBe(true);
    expect(shouldSkipRawScanDirectory("jpg원본".normalize("NFD"))).toBe(true);

    const raw = directory({ name: "RAW", files: { "A.CR2": rawFile("A.CR2") } });
    const ignored = directory({ name: "JPG", files: { "A.CR2": rawFile("A.CR2") } });
    const result = await discoverRawFolder({
      candidates: [
        { name: "JPG", handle: ignored, distance: 0 },
        { name: "RAW", handle: raw, distance: 1 },
      ],
      selectedNames: ["A.JPG"],
    });
    expect(result.candidate?.name).toBe("RAW");
    expect(result.attempts).toHaveLength(1);
  });

  it("후보 하나가 5초 제한을 넘기면 시간 초과를 기록하고 다음 후보를 확인한다", async () => {
    const hanging = directory({ name: "slow", hangEntries: true });
    const raw = directory({ name: "RAW", files: { "A.CR2": rawFile("A.CR2") } });
    const result = await discoverRawFolder({
      candidates: [
        { name: "slow", handle: hanging, distance: 0 },
        { name: "RAW", handle: raw, distance: 1 },
      ],
      selectedNames: ["A.JPG"],
      candidateTimeoutMs: 10,
    });
    expect(result.candidate?.name).toBe("RAW");
    expect(result.attempts[0]).toMatchObject({ name: "slow", status: "timeout", message: "시간 초과" });
  });

  it("자동 탐색 인덱스는 깊이 2까지만 확인한다", async () => {
    const depth3 = directory({ name: "depth3", files: { "B.CR2": rawFile("B.CR2") } });
    const nestedDepth2 = directory({ name: "depth2", files: { "A.CR2": rawFile("A.CR2") }, directories: { depth3 } });
    const depth1 = directory({ name: "depth1", directories: { nested: nestedDepth2 } });
    const root = directory({ name: "shoot", directories: { depth1 } });
    const index = await buildRawIndex(root, null, undefined, new Set(["a", "b"]), { maxDepth: 2 });
    expect(index.has("a")).toBe(true);
    expect(index.has("b")).toBe(false);
  });
});
