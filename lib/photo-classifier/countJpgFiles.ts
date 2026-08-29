const JPG_EXTS = new Set(["jpg", "jpeg"]);

// 채팅 카드에서 폴더 선택 직후 "사진 N장" 미리보기 카운트를 보여주기 위한 가벼운 스캔이다.
// PhotoSortingWorkspace.tsx의 실제 분류 스캔(EXIF 읽기, RAW 매칭, 비주얼 피처 추출 등)과는
// 완전히 별개이며, 폴더 최상위(비재귀)만 세는 것도 그 실제 스캔과 동일한 범위다(PHASE 4,
// 2026-08-30) — 미리보기 숫자가 실제 실행 결과와 어긋나 보이지 않게 하기 위함.
export async function countJpgFiles(dir: FileSystemDirectoryHandle): Promise<number> {
  let count = 0;
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind !== "file") continue;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (JPG_EXTS.has(ext)) count++;
  }
  return count;
}
