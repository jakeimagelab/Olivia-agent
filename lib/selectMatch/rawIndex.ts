import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

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
}

/* ── 재귀 RAW 스캔 공통 함수 ── */
// 파일이 수천 장이면 스캔 자체에 시간이 꽤 걸린다 — onProgress로 진행 상황(스캔한 파일 수)을
// 주기적으로 알려줘서 "멈춘 것처럼 보이는" 문제를 없앤다.
export async function buildRawIndex(
  rawRootDir: FileSystemDirectoryHandle | null,
  fallbackRootDir: FileSystemDirectoryHandle | null,
  onProgress?: (scannedCount: number) => void,
): Promise<Map<string, RawIndexEntry>> {
  const rawIndex = new Map<string, RawIndexEntry>();
  let scannedCount = 0;
  const scanDir = async (dir: FileSystemDirectoryHandle, depth = 0) => {
    if (depth > 5) return;
    for await (const [name, handle] of (dir as any).entries()) {
      if (name === "Selected_RAW") continue; // 출력 폴더는 스킵
      if ((handle as FileSystemHandle).kind === "directory") {
        await scanDir(handle as FileSystemDirectoryHandle, depth + 1);
      } else {
        scannedCount += 1;
        if (onProgress && scannedCount % 50 === 0) onProgress(scannedCount);
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (SELECT_MATCH_RAW_EXTENSIONS.has(ext)) {
          rawIndex.set(name.replace(/\.[^.]+$/, "").toLowerCase(), { fileHandle: handle as FileSystemFileHandle, dirHandle: dir });
        }
      }
    }
  };
  if (rawRootDir) {
    await scanDir(rawRootDir);
  } else if (fallbackRootDir) {
    try { await scanDir(await (fallbackRootDir as any).getDirectoryHandle("RAW")); } catch {}
    if (rawIndex.size === 0) await scanDir(fallbackRootDir);
  }
  onProgress?.(scannedCount);
  return rawIndex;
}

export async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const buf = await file.arrayBuffer();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await wr.write(buf); await wr.close();
}

export function computePreflight(selectedNames: Set<string>, rawIndex: Map<string, RawIndexEntry>): SelectMatchPreflight {
  const selArr = Array.from(selectedNames);
  const willMatch = selArr.filter((b) => rawIndex.has(b)).length;
  return {
    rawFound: rawIndex.size,
    willMatch,
    willMiss: selArr.length - willMatch,
    rawSamples: Array.from(rawIndex.keys()).slice(0, 4),
    jpgSamples: selArr.slice(0, 4),
  };
}
