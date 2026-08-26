import { parse as parseExif } from "exifr";
import { normalizeExifDateTimeOriginal } from "@/lib/metadataSelect/exifDate";

/** JPG 파일의 DateTimeOriginal을 읽어 normalize한 값을 돌려준다.
 *  reviveValues: false로 원본 문자열 그대로 받아서 타임존 변환이 섞이지 않게 한다.
 *  태그가 없거나 파싱에 실패하면 null (개별 실패로 전체 작업을 막지 않는다). */
export async function readExifDateTime(file: File): Promise<string | null> {
  try {
    const tags = await parseExif(file, { pick: ["DateTimeOriginal"], reviveValues: false });
    return normalizeExifDateTimeOriginal(tags?.DateTimeOriginal ?? null);
  } catch {
    return null;
  }
}
