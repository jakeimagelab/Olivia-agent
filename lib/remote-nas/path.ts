import type { RemoteNasEntry } from "./types";
import { REMOTE_NAS_ROOT_NAME } from "./types";

const UNSAFE_PATH_CHARACTERS = /[\\\0]/;

export function normalizeRemoteNasRelativePath(input: string): string {
  // SMB가 반환한 원본 segment를 Worker에 다시 전달해야 하므로 공백이나 Unicode form을
  // 임의로 변경하지 않는다. UI에 표시할 때만 별도로 NFC normalize한다.
  const value = input;

  if (!value) return "";
  if (value.startsWith("/") || UNSAFE_PATH_CHARACTERS.test(value)) {
    throw new Error("NAS Root 밖의 경로는 탐색할 수 없습니다.");
  }

  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("NAS Root 밖의 경로는 탐색할 수 없습니다.");
  }

  return segments.join("/");
}

export function validateRemoteNasEntryName(name: string): string {
  if (!name || name === "." || name === ".." || name.includes("/") || UNSAFE_PATH_CHARACTERS.test(name)) {
    throw new Error("올바르지 않은 NAS 항목 이름입니다.");
  }
  return name;
}

export function joinRemoteNasPath(parentPath: string, rawName: string): string {
  const parent = normalizeRemoteNasRelativePath(parentPath);
  const name = validateRemoteNasEntryName(rawName);
  return parent ? `${parent}/${name}` : name;
}

export function parentRemoteNasPath(relativePath: string): string {
  const path = normalizeRemoteNasRelativePath(relativePath);
  if (!path) return "";
  return path.split("/").slice(0, -1).join("/");
}

export function toRemoteNasDisplayName(rawName: string): string {
  return rawName.normalize("NFC");
}

export function toRemoteNasDisplayPath(rawPath: string): string {
  const path = normalizeRemoteNasRelativePath(rawPath);
  return path
    .split("/")
    .filter(Boolean)
    .map(toRemoteNasDisplayName)
    .join("/");
}

export type RemoteNasBreadcrumb = {
  path: string;
  label: string;
  root: boolean;
};

export function buildRemoteNasBreadcrumbs(relativePath: string): RemoteNasBreadcrumb[] {
  const path = normalizeRemoteNasRelativePath(relativePath);
  const breadcrumbs: RemoteNasBreadcrumb[] = [{ path: "", label: REMOTE_NAS_ROOT_NAME, root: true }];
  if (!path) return breadcrumbs;

  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    breadcrumbs.push({
      path: segments.slice(0, index + 1).join("/"),
      label: toRemoteNasDisplayName(segments[index]),
      root: false,
    });
  }

  return breadcrumbs;
}

export function sortRemoteNasEntries(entries: RemoteNasEntry[]): RemoteNasEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.displayName.localeCompare(right.displayName, "ko", { numeric: true, sensitivity: "base" });
  });
}
