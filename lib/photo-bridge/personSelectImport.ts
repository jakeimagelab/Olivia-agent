import { normalizePhotoToolFileKey, normalizePhotoToolSelectionNames } from "./toolLinkage";

export type PersonSelectImportMatch = {
  fileNames: string[];
  total: number;
  found: number;
  missing: string[];
};

/** 고객이 고른 파일명을 현재 Bridge JPG 목록과 같은 파일명 키로 대조한다. */
export function matchPersonSelectFileNames(
  fileNames: readonly string[],
  currentJpgNames: readonly string[],
): PersonSelectImportMatch {
  const uniqueFileNames = normalizePhotoToolSelectionNames(fileNames);
  const currentKeys = new Set(currentJpgNames.map(normalizePhotoToolFileKey).filter(Boolean));
  const missing = uniqueFileNames.filter((name) => !currentKeys.has(normalizePhotoToolFileKey(name)));
  return {
    fileNames: uniqueFileNames,
    total: uniqueFileNames.length,
    found: uniqueFileNames.length - missing.length,
    missing,
  };
}
