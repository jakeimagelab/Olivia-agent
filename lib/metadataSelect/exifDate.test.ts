import { describe, expect, it } from "vitest";
import { normalizeExifDateTimeOriginal } from "@/lib/metadataSelect/exifDate";

describe("normalizeExifDateTimeOriginal — EXIF 촬영시간 normalize", () => {
  it("콜론 구분 EXIF 형식을 ISO 유사 형식으로 바꾼다 (타임존 변환 없음)", () => {
    expect(normalizeExifDateTimeOriginal("2026:08:25 14:32:17")).toBe("2026-08-25T14:32:17");
  });

  it("값이 없으면 null", () => {
    expect(normalizeExifDateTimeOriginal(null)).toBeNull();
    expect(normalizeExifDateTimeOriginal(undefined)).toBeNull();
    expect(normalizeExifDateTimeOriginal("")).toBeNull();
  });

  it("형식이 다르면 null", () => {
    expect(normalizeExifDateTimeOriginal("2026-08-25 14:32:17")).toBeNull();
    expect(normalizeExifDateTimeOriginal("전혀 다른 값")).toBeNull();
  });

  it("서로 다른 두 파일이 같은 초에 촬영됐으면 같은 값으로 normalize된다", () => {
    const a = normalizeExifDateTimeOriginal("2026:08:25 14:32:17");
    const b = normalizeExifDateTimeOriginal("2026:08:25 14:32:17");
    expect(a).toBe(b);
  });
});
