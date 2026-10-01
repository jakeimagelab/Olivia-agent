const JPG_EXTENSION_PATTERN = /\.jpe?g$/i;
const MAX_REPORT_FILE_NAMES = 10_000;

/**
 * OCR은 모델이 만든 보조 입력이므로, 실제 RAW 매칭에 넘기기 전에 일반 파일 선택과
 * 같은 basename/JPG 검증을 다시 거친다. 브라우저와 서버 양쪽에서 쓰기 위해 Node 의존성을
 * 두지 않는다.
 */
export function normalizeSelectionReportFileName(value: string): string | null {
  const fileName = value.trim().normalize("NFC");
  if (!fileName || fileName.includes("\0") || fileName.includes("/") || fileName.includes("\\") || !JPG_EXTENSION_PATTERN.test(fileName)) {
    return null;
  }
  return fileName;
}

/** 이미지 OCR 결과에서 유효한 JPG/JPEG basename만 중복 없이 보존한다. */
export function normalizeSelectionReportFileNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, string>();
  for (const item of value.slice(0, MAX_REPORT_FILE_NAMES)) {
    if (typeof item !== "string") continue;
    const fileName = normalizeSelectionReportFileName(item);
    if (!fileName) continue;
    const key = fileName.toLocaleLowerCase("en-US");
    if (!unique.has(key)) unique.set(key, fileName);
  }
  return [...unique.values()];
}
