import path from "node:path";

import { normalizeNfc } from "@/lib/person-select/core";

export function resolvePersonSelectSourcePath(root: string, relativePath: string) {
  const candidate = path.resolve(
    root,
    relativePath.split(/[\\/]+/u).filter(Boolean).join(path.sep),
  );
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") throw new Error("사진 파일 경로가 없습니다.");
    throw new Error("사진 파일이 촬영 폴더 밖을 가리킵니다.");
  }
  return candidate;
}

export function normalizePersonSelectOutputFolderName(value: string) {
  return normalizeNfc(value).replace(/[\\/:*?"<>|\0]/g, "_").trim() || "이름없음";
}
