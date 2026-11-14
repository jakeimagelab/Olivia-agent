const JPG_SOURCE_FOLDER_PRIORITY = ["jpg전체", "jpg원본", "jpg"] as const;

function normalizedFolderName(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

export function isJpgSourceFolderName(name: string): boolean {
  return JPG_SOURCE_FOLDER_PRIORITY.includes(normalizedFolderName(name) as typeof JPG_SOURCE_FOLDER_PRIORITY[number]);
}

/** 실제 directory entry를 사용해 SMB의 NFC/NFD 이름 차이도 안전하게 처리한다. */
export async function resolveJpgScanRootDirectory(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  if (isJpgSourceFolderName(root.name)) return root;
  const candidates = new Map<string, FileSystemDirectoryHandle>();
  try {
    for await (const [name, handle] of (root as FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    }).entries()) {
      if (handle.kind !== "directory") continue;
      const normalized = normalizedFolderName(name);
      if (JPG_SOURCE_FOLDER_PRIORITY.includes(normalized as typeof JPG_SOURCE_FOLDER_PRIORITY[number])) {
        candidates.set(normalized, handle as FileSystemDirectoryHandle);
      }
    }
  } catch {
    return root;
  }
  return JPG_SOURCE_FOLDER_PRIORITY.flatMap((name) => candidates.get(name) ?? []).at(0) ?? root;
}
