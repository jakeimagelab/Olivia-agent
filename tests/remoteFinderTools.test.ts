import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  // path -> RemoteNasFolderResult 형태 mock 트리. listFolder를 직접 mock해서(job
  // 생성/폴링/HTTP 계층은 remoteNasDataSource.ts 자체 책임이라 이 테스트 범위가 아니다)
  // remoteFinder.ts의 tool 래핑 로직(응답 매핑, 재귀 검색 cap)만 검증한다.
  tree: {} as Record<string, { displayPath: string; entries: any[] }>,
  listFolderCalls: [] as string[],
}));

vi.mock("@/lib/remote-nas/remoteNasDataSource", () => ({
  createRemoteWorkerNasDataSource: () => ({
    listRoot: async () => {
      state.listFolderCalls.push("");
      const node = state.tree[""];
      if (!node) throw new Error("no mock folder: ROOT");
      return { rootName: "NAS", path: "", displayPath: node.displayPath, entries: node.entries, connection: { macStudio: "online", nas: "connected", source: "worker" }, readOnly: true };
    },
    listFolder: async (path: string) => {
      state.listFolderCalls.push(path);
      const node = state.tree[path];
      if (!node) throw new Error(`no mock folder: ${path}`);
      return { rootName: "NAS", path, displayPath: node.displayPath, entries: node.entries, connection: { macStudio: "online", nas: "connected", source: "worker" }, readOnly: true };
    },
  }),
}));

import { executeRemoteFinderTool } from "@/lib/olivia/v2/toolExecutors/remoteFinder";

const context = { recentActions: [], revision: 0 };

function entry(kind: "directory" | "file", name: string, path: string, sizeBytes: number | null = null) {
  return { kind, name, path, displayName: name, displayPath: `NAS/${path}`, sizeBytes, modifiedAt: null, mimeType: null };
}

describe("Finder(원격) 신규 tool — 기존 remote-jobs/Worker 파이프라인 재사용, 읽기 전용", () => {
  it("remote_folder_list는 listFolder 결과를 그대로 노출한다", async () => {
    state.tree = { "": { displayPath: "NAS", entries: [entry("directory", "0911_WINF", "0911_WINF")] } };
    const result = await executeRemoteFinderTool("remote_folder_list", {}, context);
    expect(result).toMatchObject({ success: true, data: { path: "NAS", entries: [{ name: "0911_WINF", kind: "directory" }] } });
  });

  it("remote_folder_get_info는 폴더/파일 개수와 총 용량을 집계한다", async () => {
    state.tree = {
      "0911_WINF": {
        displayPath: "NAS/0911_WINF",
        entries: [
          entry("directory", "RAW", "0911_WINF/RAW"),
          entry("file", "a.jpg", "0911_WINF/a.jpg", 1000),
          entry("file", "b.jpg", "0911_WINF/b.jpg", 2000),
        ],
      },
    };
    const result = await executeRemoteFinderTool("remote_folder_get_info", { path: "0911_WINF" }, context);
    expect(result).toMatchObject({ success: true, data: { folderCount: 1, fileCount: 2, totalBytes: 3000 } });
  });

  it("remote_folder_get_info는 path 없이 호출하면 실패한다", async () => {
    await expect(executeRemoteFinderTool("remote_folder_get_info", {}, context)).rejects.toThrow();
  });

  it("remote_file_search는 이름이 일치하는 항목을 하위 폴더까지 재귀로 찾는다", async () => {
    state.tree = {
      "": { displayPath: "NAS", entries: [entry("directory", "0911_WINF", "0911_WINF")] },
      "0911_WINF": { displayPath: "NAS/0911_WINF", entries: [entry("file", "청담스시_대표컷.jpg", "0911_WINF/청담스시_대표컷.jpg", 5000)] },
    };
    const result = await executeRemoteFinderTool("remote_file_search", { query: "청담스시" }, context);
    expect(result.success).toBe(true);
    expect((result.data as any).matches).toHaveLength(1);
    expect((result.data as any).matches[0].name).toBe("청담스시_대표컷.jpg");
  });

  it("remote_file_search는 query 없이 호출하면 실패한다", async () => {
    await expect(executeRemoteFinderTool("remote_file_search", {}, context)).rejects.toThrow();
  });

  it("remote_file_search는 방문 폴더 수 상한을 지켜 무한 재귀를 방지한다", async () => {
    // 각 폴더가 자식 폴더 1개씩만 갖는 깊은 체인이라도, 깊이 상한(5)에서 멈춰야 한다.
    const chain: Record<string, { displayPath: string; entries: any[] }> = {};
    let path = "";
    for (let i = 0; i < 20; i++) {
      const childPath = path ? `${path}/f${i}` : `f${i}`;
      chain[path] = { displayPath: `NAS/${path}`, entries: [entry("directory", `f${i}`, childPath)] };
      path = childPath;
    }
    chain[path] = { displayPath: `NAS/${path}`, entries: [] };
    state.tree = chain;
    state.listFolderCalls = [];

    await executeRemoteFinderTool("remote_file_search", { query: "no-such-name" }, context);
    // 깊이 상한 5 + 루트 1 = 최대 6~7회 정도만 방문해야 한다 — 20단 체인을 전부 훑으면 안 된다.
    expect(state.listFolderCalls.length).toBeLessThan(10);
  });
});
