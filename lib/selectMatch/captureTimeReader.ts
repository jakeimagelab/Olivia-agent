import { readPhotoTimestamp } from "@/lib/photo-classifier/timestamp";
import { parseCaptureTime } from "@/lib/selectMatch/captureTimeParser";
import type { CaptureTime } from "@/lib/selectMatch/captureTimeTypes";

const JPG_EXIF_BYTES = 1024 * 1024;
const RAW_EXIF_BYTES = 4 * 1024 * 1024;

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
