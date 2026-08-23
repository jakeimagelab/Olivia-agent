import { SELECT_MATCH_JPG_EXTENSIONS } from "@/lib/selectMatch/folderScanner";

export const SELECT_MATCH_RAW_EXTENSIONS = new Set([
  "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2", "dng", "pef", "srw", "x3f", "3fr", "mef", "mrw",
]);

/* ── 텍스트에서 파일명 파싱 ── */
export function parseNamesFromText(text: string): Set<string> {
  const re = /[\w\-가-힣]+\.(jpg|jpeg|heic|heif|tif|tiff|png|arw|cr2|cr3|nef|orf|raf|rw2|dng)/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[0].replace(/\.[^.]+$/, "").toLowerCase());
  return found;
}

/* ── 파일 업로드에서 파일명 추출 ── */
export function parseNamesFromFiles(files: FileList | File[]): Set<string> {
  const found = new Set<string>();
  Array.from(files).forEach((f) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (SELECT_MATCH_JPG_EXTENSIONS.has(ext) || SELECT_MATCH_RAW_EXTENSIONS.has(ext)) {
      found.add(f.name.replace(/\.[^.]+$/, "").toLowerCase());
    }
  });
  return found;
}
