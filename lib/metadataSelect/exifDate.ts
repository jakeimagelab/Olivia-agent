/** 기존 셀렉/매칭(lib/selectMatch)과 무관한 독립 모듈 — 메타데이터 셀렉 전용. */

/** EXIF DateTimeOriginal 원본 문자열(예: "2026:08:25 14:32:17")을 비교용으로 normalize한다.
 *  타임존 변환은 하지 않고 원본 숫자 그대로 구분자만 바꾼다. 형식이 다르면 null. */
export function normalizeExifDateTimeOriginal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}
