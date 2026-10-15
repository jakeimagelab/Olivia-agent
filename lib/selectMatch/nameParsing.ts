import {
  RAW_PHOTO_EXTENSIONS,
  SELECTABLE_IMAGE_EXTENSIONS,
} from "@/lib/photo/extensions";

export { RAW_PHOTO_EXTENSIONS as SELECT_MATCH_RAW_EXTENSIONS };

const PARSABLE_EXTENSION_PATTERN = [...SELECTABLE_IMAGE_EXTENSIONS, ...RAW_PHOTO_EXTENSIONS]
  .map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/* ── 텍스트에서 파일명 파싱 ── */
export function parseNamesFromText(text: string): Set<string> {
  const re = new RegExp(`[\\w\\-가-힣]+\\.(${PARSABLE_EXTENSION_PATTERN})`, "gi");
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
    if (SELECTABLE_IMAGE_EXTENSIONS.has(ext) || RAW_PHOTO_EXTENSIONS.has(ext)) {
      found.add(f.name.replace(/\.[^.]+$/, "").toLowerCase());
    }
  });
  return found;
}
