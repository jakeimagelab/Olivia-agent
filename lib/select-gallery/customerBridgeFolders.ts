import type { CustomerBridgeFolderManifest } from "./customerBridgeTypes";

export type CustomerBridgeFolderImage = {
  id: string;
  relative_path?: string | null;
};

export type CustomerBridgeFolder = {
  path: string;
  name: string;
  directCount: number;
  totalCount: number;
  representativeImageId: string | null;
};

export type CustomerBridgeFolderView<T extends CustomerBridgeFolderImage> = {
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  folders: CustomerBridgeFolder[];
  images: T[];
};

export type CustomerBridgeFolderTreeItem = CustomerBridgeFolder & {
  depth: number;
};

const SLASHES = /[\\/]+/g;

/** 화면 표시에 쓸 상대경로. 대소문자와 폴더 이름은 보존하고 탈출 조각만 제거한다. */
export function displayGalleryRelativePath(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFC")
    .replace(SLASHES, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function galleryFolderPath(value: string | null | undefined) {
  const parts = displayGalleryRelativePath(value).split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

/** 업로드 때 보존한 source_rel_path를 그대로 폴더 브라우저로 만든다. */
export function customerBridgeFolderView<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  requestedPath: string | null | undefined,
  manifest?: CustomerBridgeFolderManifest | null,
): CustomerBridgeFolderView<T> {
  const currentPath = displayGalleryRelativePath(requestedPath);
  const currentParts = currentPath.split("/").filter(Boolean);
  if (manifest) {
    return {
      currentPath,
      breadcrumbs: currentParts.map((name, index) => ({
        name,
        path: currentParts.slice(0, index + 1).join("/"),
      })),
      folders: manifest.folders
        .filter((folder) => displayGalleryRelativePath(folder.parentPath) === currentPath)
        .map(({ path, name, directCount, totalCount, representativeImageId }) => ({
          path,
          name,
          directCount,
          totalCount,
          representativeImageId,
        })),
      images: images.filter((image) => galleryFolderPath(image.relative_path) === currentPath),
    };
  }
  const folders = new Map<string, CustomerBridgeFolder>();
  const directImages: T[] = [];

  for (const image of images) {
    const folderPath = galleryFolderPath(image.relative_path);
    const folderParts = folderPath.split("/").filter(Boolean);
    const isInside = currentParts.every((part, index) => folderParts[index] === part);
    if (!isInside) continue;

    if (folderParts.length === currentParts.length) {
      directImages.push(image);
      continue;
    }

    const childParts = folderParts.slice(0, currentParts.length + 1);
    const childPath = childParts.join("/");
    const existing = folders.get(childPath);
    if (existing) {
      existing.totalCount += 1;
      if (folderParts.length === currentParts.length + 1) existing.directCount += 1;
    } else {
      folders.set(childPath, {
        path: childPath,
        name: childParts.at(-1) ?? childPath,
        directCount: folderParts.length === currentParts.length + 1 ? 1 : 0,
        totalCount: 1,
        representativeImageId: image.id,
      });
    }
  }

  const breadcrumbs = currentParts.map((name, index) => ({
    name,
    path: currentParts.slice(0, index + 1).join("/"),
  }));
  return { currentPath, breadcrumbs, folders: [...folders.values()], images: directImages };
}

/** 관리자 Bridge의 왼쪽 탐색 패널처럼 전체 폴더를 한 번에 보여 주는 평면 트리. */
export function customerBridgeFolderTree<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  manifest?: CustomerBridgeFolderManifest | null,
): CustomerBridgeFolderTreeItem[] {
  if (manifest) return manifest.folders.map((folder) => ({ ...folder }));
  const folders = new Map<string, CustomerBridgeFolderTreeItem>();
  for (const image of images) {
    const parts = galleryFolderPath(image.relative_path).split("/").filter(Boolean);
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const existing = folders.get(path);
      if (existing) {
        existing.totalCount += 1;
        if (index === parts.length - 1) existing.directCount += 1;
        return;
      }
      folders.set(path, {
        path,
        name,
        depth: index,
        directCount: index === parts.length - 1 ? 1 : 0,
        totalCount: 1,
        representativeImageId: image.id,
      });
    });
  }
  return [...folders.values()];
}
