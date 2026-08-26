import { parse as parseExif } from "exifr";
import { normalizeExifDateTimeOriginal } from "@/lib/metadataSelect/exifDate";

/** JPG 파일의 DateTimeOriginal을 읽어 normalize한 값을 돌려준다.
 *  reviveValues: false로 원본 문자열 그대로 받아서 타임존 변환이 섞이지 않게 한다.
 *  태그가 없으면 null(=메타데이터 없음), 파싱 자체가 실패하면 예외를 던진다(=개별 오류) —
 *  호출자가 두 경우를 구분해 "메타데이터 없음"과 "오류"를 다르게 표시할 수 있도록 여기서 합치지 않는다. */
export async function readExifDateTime(file: File): Promise<string | null> {
  const tags = await parseExif(file, { pick: ["DateTimeOriginal"], reviveValues: false });
  return normalizeExifDateTimeOriginal(tags?.DateTimeOriginal ?? null);
}
