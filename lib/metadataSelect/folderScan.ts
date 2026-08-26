import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { METADATA_SELECT_JPG_EXTENSIONS } from "@/lib/metadataSelect/matcher";

export interface ScannedFile {
  /** 루트 폴더 기준 상대 경로 포함 이름 — 중첩 폴더에 같은 파일명이 있어도 구분되도록 유지한다. */
  name: string;
  handle: FileSystemFileHandle;
}

const OUTPUT_FOLDER_NAME = "Selected_RAW";

async function scanByExtension(
  root: FileSystemDirectoryHandle,
  extensions: Set<string>,
  maxDepth: number,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  const scan = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (depth > maxDepth) return;
    for await (const [name, handle] of (dir as any).entries()) {
      if (name === OUTPUT_FOLDER_NAME) continue;
      if ((handle as FileSystemHandle).kind === "directory") {
        await scan(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name, depth + 1);
        continue;
      }
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!extensions.has(ext)) continue;
      results.push({ name: prefix ? `${prefix}/${name}` : name, handle: handle as FileSystemFileHandle });
    }
  };

  await scan(root, "", 0);
  return results;
}

/** 고객 선택본 / 촬영 원본 JPG 폴더를 재귀 스캔한다 (jpg/jpeg만). */
export async function scanJpgFiles(root: FileSystemDirectoryHandle, maxDepth = 5): Promise<ScannedFile[]> {
  return scanByExtension(root, METADATA_SELECT_JPG_EXTENSIONS, maxDepth);
}

/** RAW 원본 폴더를 재귀 스캔한다. 기존 셀렉/매칭이 쓰는 RAW 확장자 목록을 그대로 재사용한다. */
export async function scanRawFiles(root: FileSystemDirectoryHandle, maxDepth = 5): Promise<ScannedFile[]> {
  return scanByExtension(root, SELECT_MATCH_RAW_EXTENSIONS, maxDepth);
}
