import type { TimestampSource } from "./hybrid-types";

export type ExifTimestamp = { timestamp: number; source: Exclude<TimestampSource, "mtime" | "filename"> };

function parseExifDate(value: string): number | null {
  const match = value.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const timestamp = new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]),
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length && offset + index < view.byteLength; index++) {
    const value = view.getUint8(offset + index);
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result;
}

export function parseExifTimestamp(buffer: ArrayBuffer): ExifTimestamp | null {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength < 2) break;
      if (marker === 0xffe1 && readAscii(view, offset + 4, 4) === "Exif") {
        const tiffStart = offset + 10;
        const littleEndian = view.getUint16(tiffStart) === 0x4949;
        const get16 = (position: number) => view.getUint16(position, littleEndian);
        const get32 = (position: number) => view.getUint32(position, littleEndian);
        if (get16(tiffStart + 2) !== 42) return null;

        const readIfdValue = (entry: number): string | null => {
          const count = get32(entry + 4);
          const valueOffset = count <= 4 ? entry + 8 : tiffStart + get32(entry + 8);
          if (valueOffset < 0 || valueOffset + Math.min(count, 20) > view.byteLength) return null;
          return readAscii(view, valueOffset, Math.min(count, 20));
        };

        const ifd0 = tiffStart + get32(tiffStart + 4);
        let ifdDate: number | null = null;
        let exifIfd = 0;
        const ifd0Count = get16(ifd0);
        for (let index = 0; index < ifd0Count; index++) {
          const entry = ifd0 + 2 + index * 12;
          const tag = get16(entry);
          if (tag === 0x8769) exifIfd = tiffStart + get32(entry + 8);
          if (tag === 0x0132) ifdDate = parseExifDate(readIfdValue(entry) ?? "");
        }

        let createDate: number | null = null;
        if (exifIfd > 0 && exifIfd + 2 < view.byteLength) {
          const count = get16(exifIfd);
          for (let index = 0; index < count; index++) {
            const entry = exifIfd + 2 + index * 12;
            const tag = get16(entry);
            if (tag !== 0x9003 && tag !== 0x9004) continue;
            const parsed = parseExifDate(readIfdValue(entry) ?? "");
            if (!parsed) continue;
            if (tag === 0x9003) return { timestamp: parsed, source: "datetime_original" };
            createDate = parsed;
          }
        }
        if (createDate) return { timestamp: createDate, source: "create_date" };
        if (ifdDate) return { timestamp: ifdDate, source: "ifd_datetime" };
        return null;
      }
      if (marker === 0xffda) break;
      offset += 2 + segmentLength;
    }
  } catch {
    return null;
  }
  return null;
}

export async function readPhotoTimestamp(file: File): Promise<ExifTimestamp | null> {
  return parseExifTimestamp(await file.slice(0, 256 * 1024).arrayBuffer());
}
