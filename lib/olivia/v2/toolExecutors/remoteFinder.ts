import { createRemoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { RemoteNasEntry } from "@/lib/remote-nas/types";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { internalFetcher } from "./http";
import { createVerification } from "./verification";

// Finder(원격) — Phase 2 §4. 기존 /api/remote-jobs → Mac Studio Worker 파이프라인을 그대로
// 쓴다(재작성 금지, §24). listFolder()가 이미 job 생성+폴링을 다 구현하고 있어 새 Worker
// action이나 새 route가 필요 없다 — Hermes tool은 이 함수를 그대로 감싸는 얇은 wrapper다.
// 읽기 전용(삭제/이동/rename 없음)만 제공한다.
export const REMOTE_FINDER_TOOL_NAMES = ["remote_folder_list", "remote_folder_get_info", "remote_file_search"] as const;

const dataSource = createRemoteWorkerNasDataSource({ fetcher: internalFetcher });

// 서버 하나당 재귀 탐색 1건이 도는 동안 다른 요청이 끝없이 오래 걸리지 않도록 넉넉하되
// 확실한 상한을 둔다 — NAS 트리 크기가 얼마나 되는지 이 코드에서는 알 수 없다.
const SEARCH_MAX_FOLDERS_VISITED = 200;
const SEARCH_MAX_DEPTH = 5;
const SEARCH_TIMEOUT_MS = 10_000;

function entrySummary(entry: RemoteNasEntry) {
  return { name: entry.displayName, path: entry.displayPath, kind: entry.kind, sizeBytes: entry.sizeBytes, modifiedAt: entry.modifiedAt };
}

async function searchRemoteFolder(query: string, basePath: string): Promise<RemoteNasEntry[]> {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const matches: RemoteNasEntry[] = [];
  const deadline = Date.now() + SEARCH_TIMEOUT_MS;
  let visited = 0;

  async function walk(path: string, depth: number) {
    if (visited >= SEARCH_MAX_FOLDERS_VISITED || depth > SEARCH_MAX_DEPTH || Date.now() > deadline) return;
    visited += 1;
    const result = await dataSource.listFolder(path, { foldersOnly: false });
    for (const entry of result.entries) {
      if (entry.displayName.toLocaleLowerCase("ko-KR").includes(needle)) matches.push(entry);
    }
    const subfolders = result.entries.filter((entry) => entry.kind === "directory");
    for (const folder of subfolders) {
      if (visited >= SEARCH_MAX_FOLDERS_VISITED || Date.now() > deadline) break;
      await walk(folder.path, depth + 1);
    }
  }

  await walk(basePath, 0);
  return matches;
}

export async function executeRemoteFinderTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  void context;

  if (name === "remote_folder_list") {
    const path = text(input, "path");
    const result = await dataSource.listFolder(path, { foldersOnly: false });
    return {
      tool: name,
      success: true,
      data: { path: result.displayPath, entries: result.entries.map(entrySummary) },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "remote_folder_get_info") {
    const path = text(input, "path");
    if (!path) throw new Error("조회할 폴더 경로가 필요해요.");
    const result = await dataSource.listFolder(path, { foldersOnly: false });
    const folders = result.entries.filter((entry) => entry.kind === "directory").length;
    const files = result.entries.filter((entry) => entry.kind === "file");
    const totalBytes = files.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
    return {
      tool: name,
      success: true,
      data: { path: result.displayPath, folderCount: folders, fileCount: files.length, totalBytes },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "remote_file_search") {
    const query = text(input, "query");
    if (!query) throw new Error("검색어가 필요해요.");
    const basePath = text(input, "basePath");
    const matches = await searchRemoteFolder(query, basePath);
    return {
      tool: name,
      success: true,
      data: { query, matches: matches.slice(0, 50).map(entrySummary), truncated: matches.length > 50 },
      verification: createVerification({ executed: true }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
