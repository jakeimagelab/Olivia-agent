import { describe, expect, it } from "vitest";
import { buildRawIndex, copyFileHandle, computePreflight, type RawIndexEntry } from "@/lib/selectMatch/rawIndex";

type MockNode = MockDir | MockFile;
interface MockFile { kind: "file"; name: string; content: string }
interface MockDir { kind: "directory"; name: string; children: MockNode[] }

function file(name: string, content = "x"): MockFile {
  return { kind: "file", name, content };
}
function dir(name: string, children: MockNode[]): MockDir {
  return { kind: "directory", name, children };
}

function wrapHandle(node: MockNode): any {
  if (node.kind === "file") {
    return { kind: "file", name: node.name, getFile: async () => new File([node.content], node.name) };
  }
  return {
    kind: "directory",
    name: node.name,
    entries: async function* () {
      for (const child of node.children) yield [child.name, wrapHandle(child)];
    },
    getDirectoryHandle: async (name: string) => {
      const found = node.children.find((c) => c.kind === "directory" && c.name === name);
      if (!found) throw new Error("폴더를 찾을 수 없음");
      return wrapHandle(found);
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      let found = node.children.find((c) => c.kind === "file" && c.name === name) as MockFile | undefined;
      if (!found && opts?.create) {
        found = file(name, "");
        node.children.push(found);
      }
      if (!found) throw new Error("파일을 찾을 수 없음");
      const fileNode = found;
      return {
        kind: "file",
        name,
        getFile: async () => new File([fileNode.content], name),
        createWritable: async () => ({
          write: async (data: ArrayBuffer) => { fileNode.content = new TextDecoder().decode(data); },
          close: async () => {},
        }),
      };
    },
  };
}

describe("buildRawIndex — RAW 폴더 재귀 스캔", () => {
  it("RAW 확장자 파일만 basename 기준으로 인덱싱한다", async () => {
    const root = dir("RAW", [file("DSC_0001.ARW"), file("DSC_0002.cr2"), file("readme.txt")]);
    const index = await buildRawIndex(wrapHandle(root), null);
    expect(Array.from(index.keys()).sort()).toEqual(["dsc_0001", "dsc_0002"]);
  });

  it("하위 폴더까지 재귀적으로 스캔한다", async () => {
    const root = dir("RAW", [dir("scene1", [file("A001.nef")]), dir("scene2", [file("B002.dng")])]);
    const index = await buildRawIndex(wrapHandle(root), null);
    expect(Array.from(index.keys()).sort()).toEqual(["a001", "b002"]);
  });

  it("Selected_RAW 출력 폴더는 스킵한다", async () => {
    const root = dir("RAW", [file("A001.nef"), dir("Selected_RAW", [file("A001.nef")])]);
    const index = await buildRawIndex(wrapHandle(root), null);
    expect(index.size).toBe(1);
  });

  it("rawRootDir가 없으면 fallbackRootDir의 RAW/ 하위 폴더를 찾아 스캔한다", async () => {
    const fallback = dir("촬영폴더", [dir("RAW", [file("C003.arw")]), dir("JPG", [file("C003.jpg")])]);
    const index = await buildRawIndex(null, wrapHandle(fallback));
    expect(Array.from(index.keys())).toEqual(["c003"]);
  });

  it("RAW/ 하위 폴더가 없으면 fallbackRootDir 전체를 스캔한다", async () => {
    const fallback = dir("촬영폴더", [file("D004.arw")]);
    const index = await buildRawIndex(null, wrapHandle(fallback));
    expect(Array.from(index.keys())).toEqual(["d004"]);
  });

  it("onProgress를 50개마다 호출하고 마지막에 최종 개수로 한 번 더 호출한다", async () => {
    const files = Array.from({ length: 120 }, (_, i) => file(`F${i}.arw`));
    const root = dir("RAW", files);
    const progressCalls: number[] = [];
    await buildRawIndex(wrapHandle(root), null, (count) => progressCalls.push(count));
    expect(progressCalls).toContain(50);
    expect(progressCalls).toContain(100);
    expect(progressCalls.at(-1)).toBe(120); // 스캔 종료 시 마지막 호출
  });
});

describe("copyFileHandle — 파일 복사", () => {
  it("소스 파일 내용을 대상 폴더에 같은 이름으로 복사한다", async () => {
    const src = wrapHandle(file("A001.arw", "raw-bytes"));
    const dest = wrapHandle(dir("Selected_RAW", []));
    await copyFileHandle(src, dest, "A001.arw");
    const written = await dest.getFileHandle("A001.arw");
    const content = await (await written.getFile()).text();
    expect(content).toBe("raw-bytes");
  });
});

describe("computePreflight — 매칭 예상치 계산", () => {
  it("선택된 이름 중 RAW 인덱스에 있는 것만 매칭으로 센다", () => {
    const selected = new Set(["a", "b", "c"]);
    const rawIndex = new Map([["a", {} as FileSystemFileHandle], ["c", {} as FileSystemFileHandle]]);
    const pf = computePreflight(selected, rawIndex);
    expect(pf).toMatchObject({ rawFound: 2, willMatch: 2, willMiss: 1 });
  });

  it("선택된 게 없으면 전부 0", () => {
    const pf = computePreflight(new Set(), new Map());
    expect(pf).toMatchObject({ rawFound: 0, willMatch: 0, willMiss: 0 });
  });

  it("샘플은 최대 4개까지만 담는다", () => {
    const selected = new Set(["a", "b", "c", "d", "e", "f"]);
    const rawIndex = new Map(["a", "b", "c", "d", "e"].map((k) => [k, {} as FileSystemFileHandle]));
    const pf = computePreflight(selected, rawIndex);
    expect(pf.jpgSamples).toHaveLength(4);
    expect(pf.rawSamples).toHaveLength(4);
  });
});
