import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

const RAW_SCAN_DIRECTORY_CONCURRENCY = 4;
const RAW_DIRECT_LOOKUP_CONCURRENCY = 8;
const RAW_SCAN_SKIPPED_DIRECTORIES = new Set([
  "selected_raw",
  "finished_raw",
  "jpg전체",
  ".olivia",
]);

function normalizedBasename(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function shouldSkipDirectory(name: string): boolean {
  const normalized = normalizedBasename(name);
  return normalized.startsWith(".")
    || RAW_SCAN_SKIPPED_DIRECTORIES.has(normalized)
    || isDeliveredRoundFolder(name)
    || /^\d+px_q\d+$/i.test(normalized);
}

export interface SelectMatchPreflight {
  rawFound: number;
  willMatch: number;
  willMiss: number;
  rawSamples: string[];
  jpgSamples: string[];
}

// fileHandle만으로는 원본을 지울 수 없다(File System Access API에 "부모 폴더 알아내기"가
// 없음) — RAW 매칭 후 "이동" 선택지를 지원하려면 removeEntry를 부를 부모 dirHandle을 스캔
// 시점에 같이 들고 있어야 한다.
export interface RawIndexEntry {
  fileHandle: FileSystemFileHandle;
  dirHandle: FileSystemDirectoryHandle;
  relativePath: string;
}

export type RawIndex = Map<string, RawIndexEntry[]>;

export type BuildRawIndexOptions = {
  /** 자동 RAW 폴더 탐색의 표본 확인처럼 한 후보만 있으면 되는 경우에만 사용한다. */
  stopAfterFirstPerTarget?: boolean;
};

/* ── 재귀 RAW 스캔 공통 함수 ── */
// 파일이 수천 장이면 스캔 자체에 시간이 꽤 걸린다 — onProgress로 진행 상황(스캔한 파일 수)을
// 주기적으로 알려줘서 "멈춘 것처럼 보이는" 문제를 없앤다.
export async function buildRawIndex(
  rawRootDir: FileSystemDirectoryHandle | null,
  fallbackRootDir: FileSystemDirectoryHandle | null,
  onProgress?: (scannedCount: number) => void,
  targetBasenames?: ReadonlySet<string>,
  options: BuildRawIndexOptions = {},
): Promise<RawIndex> {
  const rawIndex: RawIndex = new Map();
  const remainingTargets = targetBasenames
    ? new Set(Array.from(targetBasenames, normalizedBasename).filter(Boolean))
    : null;
  let scannedCount = 0;
  const allTargetsFound = () => options.stopAfterFirstPerTarget === true
    && remainingTargets !== null
    && remainingTargets.size === 0;
  const indexedPaths = new Set<string>();

  const addEntry = (
    basename: string,
    fileHandle: FileSystemFileHandle,
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string,
  ) => {
    const normalizedPath = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    if (indexedPaths.has(normalizedPath)) return;
    indexedPaths.add(normalizedPath);
    const entries = rawIndex.get(basename) ?? [];
    entries.push({ fileHandle, dirHandle, relativePath });
    rawIndex.set(basename, entries);
    if (options.stopAfterFirstPerTarget) remainingTargets?.delete(basename);
  };

  const probeTargetsInDirectory = async (directory: FileSystemDirectoryHandle) => {
    if (!remainingTargets || remainingTargets.size === 0) return;
    const targets = [...remainingTargets];
    const extensions = [...SELECT_MATCH_RAW_EXTENSIONS];

    for (let start = 0; start < targets.length && !allTargetsFound(); start += RAW_DIRECT_LOOKUP_CONCURRENCY) {
      const chunk = targets.slice(start, start + RAW_DIRECT_LOOKUP_CONCURRENCY);
      await Promise.all(chunk.map(async (basename) => {
        if (!remainingTargets.has(basename)) return;
        const upperBasename = basename.toLocaleUpperCase("en-US");
        for (const extension of extensions) {
          const upperExtension = extension.toLocaleUpperCase("en-US");
          const candidates = new Set([
            `${upperBasename}.${upperExtension}`,
            `${basename}.${upperExtension}`,
            `${upperBasename}.${extension}`,
            `${basename}.${extension}`,
          ]);
          for (const candidate of candidates) {
            try {
              const fileHandle = await (directory as any).getFileHandle(candidate) as FileSystemFileHandle;
              addEntry(basename, fileHandle, directory, `${directory.name}/${candidate}`);
              return;
            } catch {
              // Case-sensitive volumes or nested RAW folders fall back to the
              // recursive directory scan below.
            }
          }
        }
      }));
    }
  };

  const scanTree = async (root: FileSystemDirectoryHandle) => {
    type DirectoryTask = { directory: FileSystemDirectoryHandle; depth: number; relativeDirectory: string };
    let level: DirectoryTask[] = [{ directory: root, depth: 0, relativeDirectory: root.name }];

    while (level.length > 0 && !allTargetsFound()) {
      const nextLevel: DirectoryTask[] = [];
      for (let start = 0; start < level.length && !allTargetsFound(); start += RAW_SCAN_DIRECTORY_CONCURRENCY) {
        const chunk = level.slice(start, start + RAW_SCAN_DIRECTORY_CONCURRENCY);
        const childGroups = await Promise.all(chunk.map(async ({ directory, depth, relativeDirectory }) => {
          const children: DirectoryTask[] = [];
          if (allTargetsFound()) return children;

          for await (const [name, handle] of (directory as any).entries()) {
            if (allTargetsFound()) break;
            if ((handle as FileSystemHandle).kind === "directory") {
              if (depth < 5 && !shouldSkipDirectory(name)) {
                children.push({
                  directory: handle as FileSystemDirectoryHandle,
                  depth: depth + 1,
                  relativeDirectory: `${relativeDirectory}/${name}`,
                });
              }
              continue;
            }

            scannedCount += 1;
            if (onProgress && scannedCount % 50 === 0) onProgress(scannedCount);
            const ext = name.split(".").pop()?.toLowerCase() ?? "";
            if (!SELECT_MATCH_RAW_EXTENSIONS.has(ext)) continue;

            const basename = normalizedBasename(name.replace(/\.[^.]+$/, ""));
            if (remainingTargets && !remainingTargets.has(basename)) continue;
            addEntry(
              basename,
              handle as FileSystemFileHandle,
              directory,
              `${relativeDirectory}/${name}`,
            );
          }

          return children;
        }));
        if (!allTargetsFound()) nextLevel.push(...childGroups.flat());
      }
      level = nextLevel;
    }
  };

  if (allTargetsFound()) {
    onProgress?.(scannedCount);
    return rawIndex;
  }
  if (rawRootDir) {
    await probeTargetsInDirectory(rawRootDir);
    if (!allTargetsFound()) await scanTree(rawRootDir);
  } else if (fallbackRootDir) {
    try {
      const rawDirectory = await (fallbackRootDir as any).getDirectoryHandle("RAW") as FileSystemDirectoryHandle;
      await probeTargetsInDirectory(rawDirectory);
      if (!allTargetsFound()) await scanTree(rawDirectory);
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    if (rawIndex.size === 0) {
      await probeTargetsInDirectory(fallbackRootDir);
      if (!allTargetsFound()) await scanTree(fallbackRootDir);
    }
  }
  onProgress?.(scannedCount);
  return rawIndex;
}

export function computePreflight(selectedNames: Set<string>, rawIndex: RawIndex): SelectMatchPreflight {
  const selArr = Array.from(selectedNames);
  const willMatch = selArr.filter((b) => (rawIndex.get(b)?.length ?? 0) > 0).length;
  return {
    rawFound: Array.from(rawIndex.values()).reduce((sum, entries) => sum + entries.length, 0),
    willMatch,
    willMiss: selArr.length - willMatch,
    rawSamples: Array.from(rawIndex.keys()).slice(0, 4),
    jpgSamples: selArr.slice(0, 4),
  };
}
