import { describe, expect, it } from "vitest";
import {
  buildOriginalIndex,
  buildRawIndexByBasename,
  matchSelectionToRaw,
  METADATA_SELECT_JPG_EXTENSIONS,
} from "@/lib/metadataSelect/matcher";

const RAW_EXTS = new Set(["cr3", "cr2", "arw", "nef", "raf", "dng"]);

describe("buildOriginalIndex — 원본 JPG 촬영시간 인덱스", () => {
  it("정규화된 DateTimeOriginal을 key로 묶는다", () => {
    const index = buildOriginalIndex([
      { name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "J8A_4248.JPG", normalizedDateTime: "2026-08-25T14:35:02" },
    ]);
    expect(index.get("2026-08-25T14:32:17")).toEqual(["J8A_4231.JPG"]);
  });

  it("같은 초에 여러 장이면 배열로 함께 담는다", () => {
    const index = buildOriginalIndex([
      { name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "J8A_4232.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
    ]);
    expect(index.get("2026-08-25T14:32:17")).toEqual(["J8A_4231.JPG", "J8A_4232.JPG"]);
  });

  it("메타데이터 없는 항목은 인덱싱하지 않는다", () => {
    const index = buildOriginalIndex([{ name: "no-exif.jpg", normalizedDateTime: null }]);
    expect(index.size).toBe(0);
  });
});

describe("buildRawIndexByBasename — RAW basename 인덱스", () => {
  it("RAW 확장자만 basename(소문자) 기준으로 인덱싱한다", () => {
    const index = buildRawIndexByBasename([{ name: "J8A_4231.CR3" }, { name: "readme.txt" }], RAW_EXTS);
    expect(index.get("j8a_4231")).toEqual(["J8A_4231.CR3"]);
    expect(index.has("readme")).toBe(false);
  });

  it("같은 basename의 RAW가 여러 개면 배열로 함께 담는다", () => {
    const index = buildRawIndexByBasename(
      [{ name: "folderA/J8A_4231.CR3" }, { name: "folderB/J8A_4231.CR3" }],
      RAW_EXTS,
    );
    expect(index.get("j8a_4231")).toHaveLength(2);
  });
});

describe("matchSelectionToRaw — CASE 1~5", () => {
  it("CASE 1/2: 파일명이 달라도 촬영시간이 같으면 원본→RAW로 성공 매칭한다", () => {
    const originalIndex = buildOriginalIndex([{ name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" }]);
    const rawIndex = buildRawIndexByBasename([{ name: "J8A_4231.CR3" }], RAW_EXTS);
    const row = matchSelectionToRaw("원장님최종.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex);
    expect(row).toMatchObject({
      status: "success",
      matchedOriginalName: "J8A_4231.JPG",
      rawName: "J8A_4231.CR3",
    });
  });

  it("CASE 3: 동일 초 원본 JPG가 2개면 자동 확정하지 않고 확인 필요로 분류한다", () => {
    const originalIndex = buildOriginalIndex([
      { name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "J8A_4232.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
    ]);
    const rawIndex = buildRawIndexByBasename([{ name: "J8A_4231.CR3" }, { name: "J8A_4232.CR3" }], RAW_EXTS);
    const row = matchSelectionToRaw("프로필01.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex);
    expect(row.status).toBe("needs_review");
    expect(row.candidateNames).toEqual(["J8A_4231.JPG", "J8A_4232.JPG"]);
    expect(row.rawName).toBeUndefined();
  });

  it("CASE 4: DateTimeOriginal이 없으면 메타데이터 없음으로 분류한다", () => {
    const originalIndex = buildOriginalIndex([]);
    const rawIndex = buildRawIndexByBasename([], RAW_EXTS);
    const row = matchSelectionToRaw("profile02.jpg", null, originalIndex, rawIndex);
    expect(row.status).toBe("metadata_missing");
  });

  it("CASE 5: 원본 JPG는 유일하게 찾았지만 RAW가 없으면 raw_missing으로 분류한다", () => {
    const originalIndex = buildOriginalIndex([{ name: "J8A_4300.JPG", normalizedDateTime: "2026-08-25T15:00:00" }]);
    const rawIndex = buildRawIndexByBasename([], RAW_EXTS);
    const row = matchSelectionToRaw("대표사진.jpg", "2026-08-25T15:00:00", originalIndex, rawIndex);
    expect(row.status).toBe("raw_missing");
    expect(row.matchedOriginalName).toBe("J8A_4300.JPG");
  });

  it("같은 basename의 RAW가 여러 개면 잘못된 복사를 막기 위해 확인 필요로 분류한다", () => {
    const originalIndex = buildOriginalIndex([{ name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" }]);
    const rawIndex = buildRawIndexByBasename(
      [{ name: "folderA/J8A_4231.CR3" }, { name: "folderB/J8A_4231.CR3" }],
      RAW_EXTS,
    );
    const row = matchSelectionToRaw("원장님최종.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex);
    expect(row.status).toBe("needs_review");
    expect(row.candidateNames).toHaveLength(2);
  });

  it("촬영시간이 유효해도 매칭되는 원본이 하나도 없으면 확인 필요로 분류한다", () => {
    const originalIndex = buildOriginalIndex([{ name: "J8A_9999.JPG", normalizedDateTime: "2026-08-25T09:00:00" }]);
    const rawIndex = buildRawIndexByBasename([], RAW_EXTS);
    const row = matchSelectionToRaw("엉뚱한선택.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex);
    expect(row.status).toBe("needs_review");
    expect(row.candidateNames).toEqual([]);
  });
});

describe("METADATA_SELECT_JPG_EXTENSIONS", () => {
  it("jpg/jpeg만 포함한다", () => {
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("jpg")).toBe(true);
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("jpeg")).toBe(true);
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("png")).toBe(false);
  });
});
