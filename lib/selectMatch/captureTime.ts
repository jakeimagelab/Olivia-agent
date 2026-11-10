import { readPhotoTimestamp } from "@/lib/photo-classifier/timestamp";

const JPG_EXIF_BYTES = 1024 * 1024;
const RAW_EXIF_BYTES = 4 * 1024 * 1024;

export type CaptureTime = {
  timestampMs: number;
  dateTimeOriginal: string;
  subSecTimeOriginal: string | null;
  hasSubseconds: boolean;
};

function readAscii(view: DataView, offset: number, length: number): string {
  if (offset < 0 || offset >= view.byteLength || length <= 0) return "";
  let result = "";
  const end = Math.min(view.byteLength, offset + length);
  for (let index = offset; index < end; index += 1) {
    const value = view.getUint8(index);
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result.trim();
}

function parseDateTimeOriginal(value: string): number | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const timestamp = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function subsecondMilliseconds(value: string | null): number {
  if (!value) return 0;
  const digits = value.match(/^\d+/)?.[0];
  if (!digits) return 0;
  return Math.round(Number(`0.${digits}`) * 1000);
}

function parseTiffCaptureTime(view: DataView, tiffStart: number): CaptureTime | null {
  try {
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return null;
    const byteOrder = view.getUint16(tiffStart, false);
    const littleEndian = byteOrder === 0x4949;
    if (!littleEndian && byteOrder !== 0x4d4d) return null;
    const get16 = (offset: number) => view.getUint16(offset, littleEndian);
    const get32 = (offset: number) => view.getUint32(offset, littleEndian);
    if (get16(tiffStart + 2) !== 42) return null;

    const readEntryAscii = (entryOffset: number): string => {
      if (entryOffset + 12 > view.byteLength) return "";
      const count = get32(entryOffset + 4);
      if (count <= 0 || count > 1024) return "";
      const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + get32(entryOffset + 8);
      return readAscii(view, valueOffset, count);
    };

    const walkIfd = (ifdOffset: number, visitor: (tag: number, entryOffset: number) => void) => {
      if (ifdOffset < 0 || ifdOffset + 2 > view.byteLength) return;
      const count = get16(ifdOffset);
      if (count > 4096 || ifdOffset + 2 + count * 12 > view.byteLength) return;
      for (let index = 0; index < count; index += 1) {
        const entryOffset = ifdOffset + 2 + index * 12;
        visitor(get16(entryOffset), entryOffset);
      }
    };

    const ifd0 = tiffStart + get32(tiffStart + 4);
    let exifIfd = -1;
    walkIfd(ifd0, (tag, entryOffset) => {
      if (tag === 0x8769) exifIfd = tiffStart + get32(entryOffset + 8);
    });
    if (exifIfd < 0) return null;

    let dateTimeOriginal = "";
    let subSecTimeOriginal: string | null = null;
    walkIfd(exifIfd, (tag, entryOffset) => {
      if (tag === 0x9003) dateTimeOriginal = readEntryAscii(entryOffset);
      if (tag === 0x9291) subSecTimeOriginal = readEntryAscii(entryOffset) || null;
    });
    const timestamp = parseDateTimeOriginal(dateTimeOriginal);
    if (timestamp === null) return null;
    const hasSubseconds = Boolean(subSecTimeOriginal && /^\d+/.test(subSecTimeOriginal));
    return {
      timestampMs: timestamp + subsecondMilliseconds(subSecTimeOriginal),
      dateTimeOriginal,
      subSecTimeOriginal,
      hasSubseconds,
    };
  } catch {
    return null;
  }
}

function hasBytes(view: DataView, offset: number, bytes: readonly number[]): boolean {
  if (offset < 0 || offset + bytes.length > view.byteLength) return false;
  return bytes.every((value, index) => view.getUint8(offset + index) === value);
}

/** JPEG, TIFF 기반 RAW, CR3 CMT1 안에서 EXIF 촬영시각을 찾는다. */
export function parseCaptureTime(buffer: ArrayBuffer): CaptureTime | null {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const priorityCandidates: number[] = [];
  const candidates: number[] = [];
  const seen = new Set<number>();
  const addCandidate = (offset: number, priority = false) => {
    if (offset < 0 || offset >= view.byteLength || seen.has(offset)) return;
    seen.add(offset);
    (priority ? priorityCandidates : candidates).push(offset);
  };

  if (hasBytes(view, 0, [0x49, 0x49, 0x2a, 0x00]) || hasBytes(view, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    addCandidate(0);
  }

  // JPEG APP1, CR3의 CMT1/Exif payload를 모두 포괄한다. 최대 4MB만 보므로
  // 전체 RAW를 메모리에 올리지 않는다.
  for (let offset = 0; offset + 10 <= view.byteLength; offset += 1) {
    const first = bytes[offset];
    if (
      first === 0x43
      && bytes[offset + 1] === 0x4d
      && bytes[offset + 2] === 0x54
      && bytes[offset + 3] === 0x31
    ) {
      const boxStart = offset >= 4 ? offset - 4 : -1;
      const declaredSize = boxStart >= 0 ? view.getUint32(boxStart, false) : 0;
      const payloadStart = offset + 4;
      const payloadEnd = declaredSize >= 8 && boxStart + declaredSize <= view.byteLength
        ? boxStart + declaredSize
        : view.byteLength;
      for (let cursor = payloadStart; cursor + 6 <= payloadEnd; cursor += 1) {
        if (
          bytes[cursor] === 0x45 && bytes[cursor + 1] === 0x78 && bytes[cursor + 2] === 0x69
          && bytes[cursor + 3] === 0x66 && bytes[cursor + 4] === 0 && bytes[cursor + 5] === 0
        ) addCandidate(cursor + 6, true);
        if (
          (bytes[cursor] === 0x49 && bytes[cursor + 1] === 0x49 && bytes[cursor + 2] === 0x2a && bytes[cursor + 3] === 0)
          || (bytes[cursor] === 0x4d && bytes[cursor + 1] === 0x4d && bytes[cursor + 2] === 0 && bytes[cursor + 3] === 0x2a)
        ) addCandidate(cursor, true);
      }
    }
    if (
      first === 0x45
      && bytes[offset + 1] === 0x78
      && bytes[offset + 2] === 0x69
      && bytes[offset + 3] === 0x66
      && bytes[offset + 4] === 0x00
      && bytes[offset + 5] === 0x00
    ) {
      addCandidate(offset + 6);
      offset += 5;
      continue;
    }
    if (
      (first === 0x49 && bytes[offset + 1] === 0x49 && bytes[offset + 2] === 0x2a && bytes[offset + 3] === 0x00)
      || (first === 0x4d && bytes[offset + 1] === 0x4d && bytes[offset + 2] === 0x00 && bytes[offset + 3] === 0x2a)
    ) {
      addCandidate(offset);
      offset += 3;
    }
  }

  for (const offset of [...priorityCandidates, ...candidates]) {
    const parsed = parseTiffCaptureTime(view, offset);
    if (parsed) return parsed;
  }
  return null;
}

export async function readJpgCaptureTime(file: File): Promise<CaptureTime | null> {
  const [existing, buffer] = await Promise.all([
    readPhotoTimestamp(file),
    file.slice(0, JPG_EXIF_BYTES).arrayBuffer(),
  ]);
  const detailed = parseCaptureTime(buffer);
  if (detailed) return detailed;
  // RAW 안전 매칭에는 DateTimeOriginal만 허용한다. 파일 수정시각 성격의 IFD
  // DateTime/CreateDate를 촬영시각으로 대신 쓰면 번호 순환 사진을 잘못 고를 수 있다.
  if (!existing || existing.source !== "datetime_original") return null;
  return {
    timestampMs: existing.timestamp,
    dateTimeOriginal: new Date(existing.timestamp).toISOString(),
    subSecTimeOriginal: null,
    hasSubseconds: false,
  };
}

export async function readRawCaptureTime(file: File): Promise<CaptureTime | null> {
  return parseCaptureTime(await file.slice(0, RAW_EXIF_BYTES).arrayBuffer());
}

export function formatCaptureTime(value: CaptureTime | null): string {
  if (!value) return "촬영시각 없음";
  return value.subSecTimeOriginal
    ? `${value.dateTimeOriginal}.${value.subSecTimeOriginal}`
    : value.dateTimeOriginal;
}
