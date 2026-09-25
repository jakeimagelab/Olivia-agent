import path from "node:path";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RemoteNasDataSource, RemoteNasEntry } from "@/lib/remote-nas/types";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

const MAX_MATCHES = 12;
const MAX_VISITED_FOLDERS_PER_PROJECT = 256;

export type PhotoFolderCandidate = {
  name: string;
  displayName: string;
  sourceRelativePath: string;
  displayPath: string;
  fileCount: number;
  jpgCount: number;
  jpgBytes: number;
  rawCount: number;
  totalBytes: number;
  modifiedAt: string | null;
};

function comparable(value: string): string {
  // 사용자는 "0918 삼 칠 갈비"처럼 말할 수 있고 실제 백업 폴더는
  // "0918_삼칠갈비"일 수 있다. 검색 비교에서만 흔한 구분자를 제거하며,
  // 실제 relative path는 원문 그대로 보존한다. 넓어진 검색이 여러 폴더에
  // 걸리면 기존 ambiguity guard가 mutation을 계속 차단한다.
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s_-]+/g, "");
}

function extension(entry: RemoteNasEntry): string {
  return path.extname(entry.name).slice(1).toLocaleLowerCase("en-US");
}

function newerDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  const currentTime = new Date(current).getTime();
  const candidateTime = new Date(candidate).getTime();
  if (!Number.isFinite(candidateTime)) return current;
  return !Number.isFinite(currentTime) || candidateTime > currentTime ? candidate : current;
}

async function summarizeProjectFolder(
  rootEntry: RemoteNasEntry,
  dataSource: RemoteNasDataSource,
): Promise<PhotoFolderCandidate> {
  const pending = [rootEntry.path];
  let visited = 0;
  let fileCount = 0;
  let jpgCount = 0;
  let jpgBytes = 0;
  let rawCount = 0;
  let totalBytes = 0;
  let modifiedAt = rootEntry.modifiedAt;

  while (pending.length) {
    if (visited >= MAX_VISITED_FOLDERS_PER_PROJECT) {
      throw new OliviaToolError(
        `"${rootEntry.displayName}" 폴더가 너무 깊어 안전한 조회 한도를 초과했어요.`,
        "PHOTO_FOLDER_SCAN_LIMIT",
        { sourceRelativePath: rootEntry.path, maxVisitedFolders: MAX_VISITED_FOLDERS_PER_PROJECT },
      );
    }
    const current = pending.shift()!;
    visited += 1;
    const result = await dataSource.listFolder(current, { foldersOnly: false });
    for (const entry of result.entries) {
      modifiedAt = newerDate(modifiedAt, entry.modifiedAt);
      if (entry.kind === "directory") {
        pending.push(entry.path);
        continue;
      }
      fileCount += 1;
      totalBytes += entry.sizeBytes ?? 0;
      const ext = extension(entry);
      if (JPG_PHOTO_EXTENSIONS.has(ext)) {
        jpgCount += 1;
        jpgBytes += entry.sizeBytes ?? 0;
      }
      if (RAW_PHOTO_EXTENSIONS.has(ext)) rawCount += 1;
    }
  }

  return {
    name: rootEntry.name,
    displayName: rootEntry.displayName,
    sourceRelativePath: rootEntry.path,
    displayPath: rootEntry.displayPath,
    fileCount,
    jpgCount,
    jpgBytes,
    rawCount,
    totalBytes,
    modifiedAt,
  };
}

/** Workstation의 1-depth 프로젝트 폴더를 읽기 전용으로 검색한다. */
export async function findPhotoFolderCandidates(
  query: string,
  dataSource: RemoteNasDataSource,
): Promise<PhotoFolderCandidate[]> {
  const needle = comparable(query);
  if (!needle) throw new OliviaToolError("찾을 촬영 폴더 이름을 알려주세요.", "PHOTO_FOLDER_QUERY_REQUIRED");

  const root = await dataSource.listRoot({ foldersOnly: true });
  const matches = root.entries
    .filter((entry) => entry.kind === "directory" && comparable(entry.displayName).includes(needle))
    .slice(0, MAX_MATCHES);

  const summaries: PhotoFolderCandidate[] = [];
  // Worker는 job을 하나씩 처리한다. Promise.all로 동시에 여러 LIST_FOLDER job을 쌓지 않는다.
  for (const entry of matches) summaries.push(await summarizeProjectFolder(entry, dataSource));
  return summaries;
}

/** mutation 전에 모호성을 다시 검사해 모델이 임의의 후보를 고르는 우회 경로를 막는다. */
export async function resolveSinglePhotoFolderCandidate(
  query: string,
  dataSource: RemoteNasDataSource,
): Promise<PhotoFolderCandidate> {
  const candidates = await findPhotoFolderCandidates(query, dataSource);
  if (!candidates.length) {
    throw new OliviaToolError(`"${query}"와 일치하는 촬영 폴더를 찾지 못했어요.`, "PHOTO_FOLDER_NOT_FOUND", { query });
  }

  const needle = comparable(query);
  const exact = candidates.filter((candidate) =>
    comparable(candidate.displayName) === needle || comparable(candidate.sourceRelativePath) === needle,
  );
  if (exact.length === 1) return exact[0];
  if (candidates.length === 1) return candidates[0];

  throw new OliviaToolError(
    `"${query}"와 비슷한 촬영 폴더가 여러 개예요. 정확한 폴더를 선택해주세요.`,
    "AMBIGUOUS_PHOTO_FOLDER",
    {
      query,
      candidates: candidates.map((candidate) => ({
        name: candidate.displayName,
        sourceRelativePath: candidate.sourceRelativePath,
        fileCount: candidate.fileCount,
        jpgCount: candidate.jpgCount,
        jpgBytes: candidate.jpgBytes,
        rawCount: candidate.rawCount,
        totalBytes: candidate.totalBytes,
        modifiedAt: candidate.modifiedAt,
      })),
    },
  );
}
