import { CAMERA_JPG_EXTENSIONS, isHiddenSystemFile, RAW_PHOTO_EXTENSIONS } from "@/lib/photo/extensions";

export type SplitRawFile = {
  name: string;
  handle: FileSystemFileHandle;
};

export type SplitJpgFile = SplitRawFile & {
  file: File;
  mtime: number;
  fileSize: number;
};

export async function splitRawAndJpg(dir: FileSystemDirectoryHandle): Promise<{
  rawFiles: SplitRawFile[];
  jpgFiles: SplitJpgFile[];
}> {
  const rawFiles: SplitRawFile[] = [];
  const jpgFiles: SplitJpgFile[] = [];
  for await (const [name, handle] of (dir as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries()) {
    if (isHiddenSystemFile(String(name))) continue;
    if (handle.kind !== "file") continue;
    const extension = String(name).split(".").pop()?.toLowerCase() ?? "";
    if (RAW_PHOTO_EXTENSIONS.has(extension)) {
      rawFiles.push({ name: String(name), handle: handle as FileSystemFileHandle });
      continue;
    }
    if (!CAMERA_JPG_EXTENSIONS.has(extension)) continue;
    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    jpgFiles.push({
      name: String(name),
      handle: fileHandle,
      file,
      mtime: file.lastModified,
      fileSize: file.size,
    });
  }
  return { rawFiles, jpgFiles };
}

export async function isSameDirectoryHandle(
  left: FileSystemDirectoryHandle | null,
  right: FileSystemDirectoryHandle,
) {
  if (!left) return false;
  if (left === right) return true;
  const identityAware = left as FileSystemDirectoryHandle & {
    isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
  };
  if (!identityAware.isSameEntry) return false;
  try {
    return await identityAware.isSameEntry(right);
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "작업"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 시간 초과 (${Math.round(ms / 1000)}초)`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function copyFileHandle(
  source: FileSystemFileHandle,
  destination: FileSystemDirectoryHandle,
  name: string,
) {
  await withTimeout((async () => {
    const file = await source.getFile();
    const destinationHandle = await destination.getFileHandle(name, { create: true });
    const writer = await destinationHandle.createWritable();
    await file.stream().pipeTo(writer);
    const copied = await destinationHandle.getFile();
    if (copied.size !== file.size) {
      throw new Error(`${name} 복사 검증 실패 (${file.size} → ${copied.size})`);
    }
  })(), 120000, `${name} 복사`);
}

export async function renameDirHandle(
  parentDir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
  sourceDir: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  if (oldName === newName) return sourceDir;
  const newDir = await parentDir.getDirectoryHandle(newName, { create: true });
  const entries: Array<[string, FileSystemFileHandle]> = [];
  for await (const [fileName, fileHandle] of (sourceDir as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries()) {
    if (fileHandle.kind === "file") entries.push([fileName, fileHandle as FileSystemFileHandle]);
  }
  for (const [fileName, fileHandle] of entries) {
    await copyFileHandle(fileHandle, newDir, fileName);
    await sourceDir.removeEntry(fileName);
  }
  try {
    await parentDir.removeEntry(oldName);
  } catch (error) {
    console.error("[OLIVIA] Suppressed error", error);
  }
  return newDir;
}
