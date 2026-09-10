// 사진 일괄 리사이즈 — 순수 서비스 함수. UI(PhotoResizeWorkspace.tsx)가 지금 이 함수를
// 직접 호출하지만, 나중에 Olivia 채팅 도구가 같은 기능을 필요로 하면 이 함수를 그대로
// import해서 쓸 수 있도록 UI 상태와 완전히 분리해뒀다(요청서의 "PhotoResizeService" 구조).

export type PhotoResizeOptions = {
  /** 긴 변 기준 목표 해상도(px). 원본이 이보다 작으면 확대하지 않는다. */
  longEdge: number;
  /** JPEG 품질(1~100). */
  quality: number;
};

export type PhotoResizeFailure = { path: string; reason: string };

export type PhotoResizeStats = {
  completed: number;
  skipped: number;
  failed: number;
  failures: PhotoResizeFailure[];
};

export type PhotoResizeCallbacks = {
  onProgress?: (currentPath: string, stats: PhotoResizeStats) => void;
};

const IMAGE_EXT = /\.(jpe?g)$/i;
const OUTPUT_FOLDER_PATTERN = /^\d+px_Q\d+$/;

export function resultFolderName(options: PhotoResizeOptions): string {
  return `${options.longEdge}px_Q${options.quality}`;
}

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function resizeImageFile(file: File, options: PhotoResizeOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, options.longEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들지 못했습니다.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: Math.min(1, Math.max(0.01, options.quality / 100)) });
  } finally {
    bitmap.close();
  }
}

/**
 * rootDir 아래 모든 하위 폴더의 JPEG를 재귀적으로 찾아 리사이즈하고, rootDir 바로 아래
 * "{긴변}px_Q{품질}" 결과 폴더에 같은 폴더 구조로 저장한다. 이미 결과 폴더에 같은 이름의
 * 파일이 있으면 건너뛰고(skipped), 다른 리사이즈 실행이 만든 결과 폴더(패턴: 숫자px_Q숫자)는
 * 검색 대상에서 제외해 결과 폴더끼리 중첩 변환되는 일을 막는다.
 */
export async function runPhotoResize(
  rootDir: FileSystemDirectoryHandle,
  options: PhotoResizeOptions,
  shouldStop: () => boolean,
  callbacks: PhotoResizeCallbacks = {},
): Promise<PhotoResizeStats> {
  const stats: PhotoResizeStats = { completed: 0, skipped: 0, failed: 0, failures: [] };
  const outputName = resultFolderName(options);
  const resultDir = await rootDir.getDirectoryHandle(outputName, { create: true });

  async function walk(dir: FileSystemDirectoryHandle, outDir: FileSystemDirectoryHandle, relPath: string, isRoot: boolean) {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (shouldStop()) return;
      if (handle.kind === "directory") {
        if (isRoot && name === outputName) continue;
        if (OUTPUT_FOLDER_PATTERN.test(name)) continue;
        const nextOut = await outDir.getDirectoryHandle(name, { create: true });
        await walk(handle as FileSystemDirectoryHandle, nextOut, `${relPath}${name}/`, false);
        continue;
      }
      if (!IMAGE_EXT.test(name)) continue;
      const path = `${relPath}${name}`;
      try {
        if (await fileExists(outDir, name)) {
          stats.skipped += 1;
          callbacks.onProgress?.(path, { ...stats, failures: [...stats.failures] });
          continue;
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        const blob = await resizeImageFile(file, options);
        const outHandle = await outDir.getFileHandle(name, { create: true });
        const writable = await outHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        stats.completed += 1;
      } catch (error) {
        stats.failed += 1;
        const reason = error instanceof Error ? error.message : "알 수 없는 오류";
        stats.failures.push({ path, reason });
      }
      callbacks.onProgress?.(path, { ...stats, failures: [...stats.failures] });
    }
  }

  await walk(rootDir, resultDir, "", true);
  return stats;
}

/**
 * 실제 변환 전에 대상 사진 총 개수를 먼저 센다 — 진행률 게이지를 "왔다갔다"가 아니라
 * 실제 퍼센트로 채우려면 분모(총 개수)가 필요하다. 파일 내용은 읽지 않고 디렉터리 목록만
 * 훑으므로 1,500장 기준으로도 몇 초 이내에 끝난다.
 */
export async function countSourcePhotos(
  rootDir: FileSystemDirectoryHandle,
  outputName: string,
  shouldStop: () => boolean,
): Promise<number> {
  let total = 0;
  async function walk(dir: FileSystemDirectoryHandle, isRoot: boolean) {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (shouldStop()) return;
      if (handle.kind === "directory") {
        if (isRoot && name === outputName) continue;
        if (OUTPUT_FOLDER_PATTERN.test(name)) continue;
        await walk(handle as FileSystemDirectoryHandle, false);
        continue;
      }
      if (IMAGE_EXT.test(name)) total += 1;
    }
  }
  await walk(rootDir, true);
  return total;
}

export type PhotoPreviewEntry = { path: string; handle: FileSystemFileHandle };

/** 결과 폴더 미리보기용 — 전부가 아니라 limit개까지만 찾으면 바로 멈춘다. */
export async function listResultPhotos(resultDir: FileSystemDirectoryHandle, limit: number): Promise<PhotoPreviewEntry[]> {
  const out: PhotoPreviewEntry[] = [];
  async function walk(dir: FileSystemDirectoryHandle, relPath: string) {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (out.length >= limit) return;
      if (handle.kind === "directory") {
        await walk(handle as FileSystemDirectoryHandle, `${relPath}${name}/`);
      } else if (IMAGE_EXT.test(name)) {
        out.push({ path: `${relPath}${name}`, handle: handle as FileSystemFileHandle });
      }
      if (out.length >= limit) return;
    }
  }
  await walk(resultDir, "");
  return out;
}
