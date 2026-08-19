export const SELECT_MATCH_JPG_EXTENSIONS = new Set(["jpg", "jpeg", "heic", "heif", "tif", "tiff", "webp", "png"]);

export interface SelectMatchPhoto {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  thumbUrl: string | null;
  rating: number | null;
}

export interface SelectMatchFolderGroup {
  name: string;
  dirHandle: FileSystemDirectoryHandle;
  photos: SelectMatchPhoto[];
}

/** 폴더 이름 규칙 없이 JPG 계열 파일을 재귀 수집한다. */
export async function collectJpgFolderGroups(
  root: FileSystemDirectoryHandle,
  maxDepth = 5,
): Promise<SelectMatchFolderGroup[]> {
  const groups: SelectMatchFolderGroup[] = [];

  const scan = async (dir: FileSystemDirectoryHandle, depth = 0) => {
    if (depth > maxDepth) return;

    const photos: SelectMatchPhoto[] = [];
    const childDirectories: FileSystemDirectoryHandle[] = [];

    for await (const [name, handle] of (dir as any).entries()) {
      if ((handle as FileSystemHandle).kind === "directory") {
        childDirectories.push(handle as FileSystemDirectoryHandle);
        continue;
      }

      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!SELECT_MATCH_JPG_EXTENSIONS.has(ext)) continue;
      photos.push({
        name,
        basename: name.replace(/\.[^.]+$/, ""),
        handle: handle as FileSystemFileHandle,
        thumbUrl: null,
        rating: null,
      });
    }

    photos.sort((a, b) => a.name.localeCompare(b.name));
    if (photos.length > 0) groups.push({ name: dir.name, dirHandle: dir, photos });

    childDirectories.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of childDirectories) await scan(child, depth + 1);
  };

  await scan(root);
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}
