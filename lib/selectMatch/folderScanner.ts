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

/** SelectMatchFolderGroup[]을 basename Set으로 평탄화한다 — nameParsing.ts의
 * parseNamesFromText/parseNamesFromFiles와 동일하게 소문자로 정규화해야 buildRawIndex/
 * computePreflight의 매칭 키(둘 다 .toLowerCase() 사용)와 대소문자가 어긋나지 않는다.
 * collectJpgFolderGroups()의 basename 자체는 소문자화되어 있지 않으므로(원본 파일명 그대로)
 * 여기서 명시적으로 낮춘다. */
export function flattenFolderGroupsToNames(groups: SelectMatchFolderGroup[]): Set<string> {
  const names = new Set<string>();
  for (const group of groups) {
    for (const photo of group.photos) names.add(photo.basename.toLowerCase());
  }
  return names;
}
