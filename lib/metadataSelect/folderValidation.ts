import {
  FINISHED_RAW_DIRECTORY,
  JPG_RETOUCHED_DIRECTORY,
  SELECTED_RAW_DIRECTORY,
} from "@/lib/photo-classifier/node/storageLayout";

async function sameEntry(left: FileSystemHandle, right: FileSystemHandle): Promise<boolean> {
  if (typeof left.isSameEntry !== "function") throw new Error("이 브라우저는 폴더 동일성 확인을 지원하지 않습니다.");
  return left.isSameEntry(right);
}

async function resolveChild(
  ancestor: FileSystemDirectoryHandle,
  candidate: FileSystemHandle,
): Promise<string[] | null> {
  if (typeof ancestor.resolve !== "function") throw new Error("이 브라우저는 폴더 관계 확인을 지원하지 않습니다.");
  return ancestor.resolve(candidate);
}

function containsOutputSegment(parts: readonly string[] | null): boolean {
  return !!parts?.some((part) => (
    part === JPG_RETOUCHED_DIRECTORY
    || part === SELECTED_RAW_DIRECTORY
    || part === FINISHED_RAW_DIRECTORY
  ));
}

export async function validateMetadataSelectFolders({
  selectionDir,
  sourceDir,
  rawDir,
}: {
  selectionDir: FileSystemDirectoryHandle;
  sourceDir: FileSystemDirectoryHandle | null;
  rawDir: FileSystemDirectoryHandle;
}): Promise<void> {
  if (sourceDir && await sameEntry(selectionDir, sourceDir)) throw new Error("선택본과 원본 JPG 폴더가 같습니다.");
  if (await sameEntry(selectionDir, rawDir)) throw new Error("선택본과 RAW 원본 폴더가 같습니다.");
  if (sourceDir && await sameEntry(sourceDir, rawDir)) throw new Error("원본 JPG와 RAW 원본 폴더가 같습니다.");

  if (containsOutputSegment([selectionDir.name])) {
    throw new Error("출력 폴더를 선택본으로 사용할 수 없습니다.");
  }
  if (rawDir.name === SELECTED_RAW_DIRECTORY || rawDir.name === FINISHED_RAW_DIRECTORY) {
    throw new Error("Selected_RAW 또는 Finished_RAW 자체를 RAW 원본으로 사용할 수 없습니다.");
  }
  if (sourceDir && containsOutputSegment([sourceDir.name])) {
    throw new Error("출력 폴더를 원본 JPG로 사용할 수 없습니다.");
  }

  const selectionUnderRaw = await resolveChild(rawDir, selectionDir);
  if (containsOutputSegment(selectionUnderRaw)) throw new Error("Selected_RAW 또는 그 하위 폴더를 입력으로 사용할 수 없습니다.");

  if (sourceDir) {
    const sourceUnderRaw = await resolveChild(rawDir, sourceDir);
    if (containsOutputSegment(sourceUnderRaw)) throw new Error("RAW 출력 폴더 또는 그 하위 폴더를 원본 JPG로 사용할 수 없습니다.");
  }
}
