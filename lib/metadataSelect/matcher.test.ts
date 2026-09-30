import { describe, expect, it } from "vitest";
import {
  buildOriginalIndex,
  buildDateTimeIndex,
  buildRawIndexByBasename,
  matchSelectionDateTimeToRaw,
  matchSelectionNameToRaw,
  matchSelectionToRaw,
  markDuplicateRawMatches,
  METADATA_SELECT_JPG_EXTENSIONS,
  rawNamesOf,
  uniqueRawNames,
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

  it("CASE 3: 동일 초 원본 JPG가 2개면 연사 그룹 RAW를 모두 선택한다", () => {
    const originalIndex = buildOriginalIndex([
      { name: "J8A_4231.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "J8A_4232.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
    ]);
    const rawIndex = buildRawIndexByBasename([{ name: "J8A_4231.CR3" }, { name: "J8A_4232.CR3" }], RAW_EXTS);
    const row = matchSelectionToRaw("프로필01.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex);
    expect(row).toMatchObject({
      status: "success",
      matchedOriginalName: "J8A_4231.JPG",
      matchedOriginalNames: ["J8A_4231.JPG", "J8A_4232.JPG"],
      rawName: "J8A_4231.CR3",
      rawNames: ["J8A_4231.CR3", "J8A_4232.CR3"],
      message: "동일 촬영시간 RAW 2장 모두 선택",
    });
  });

  it("같은 시간 원본 3장 중 RAW 2장만 있으면 찾은 RAW는 선택하고 누락 수를 알린다", () => {
    const originalIndex = buildOriginalIndex([
      { name: "A.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "B.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
      { name: "C.JPG", normalizedDateTime: "2026-08-25T14:32:17" },
    ]);
    const rawIndex = buildRawIndexByBasename([{ name: "A.ARW" }, { name: "B.ARW" }], RAW_EXTS);
    expect(matchSelectionToRaw("프로필01.jpg", "2026-08-25T14:32:17", originalIndex, rawIndex)).toMatchObject({
      status: "success",
      rawNames: ["A.ARW", "B.ARW"],
      message: "동일 촬영시간 3장 중 RAW 2장 매칭 · 1장 미발견",
    });
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

describe("matchSelectionNameToRaw — 원본 JPG 없는 직접 매칭", () => {
  it("선택본과 RAW의 basename이 같으면 직접 매칭한다", () => {
    const rawIndex = buildRawIndexByBasename([{ name: "R5K07537.ARW" }], RAW_EXTS);
    expect(matchSelectionNameToRaw("R5K07537.JPG", rawIndex)).toMatchObject({
      status: "success",
      matchedOriginalName: "R5K07537.JPG",
      rawName: "R5K07537.ARW",
    });
  });

  it("같은 basename의 RAW가 없으면 RAW 미발견으로 표시한다", () => {
    const rawIndex = buildRawIndexByBasename([], RAW_EXTS);
    expect(matchSelectionNameToRaw("R5K07537.JPG", rawIndex)).toMatchObject({
      status: "raw_missing",
      message: "같은 파일명의 RAW를 찾지 못했습니다.",
    });
  });

  it("같은 basename 후보가 여러 개면 자동 확정하지 않는다", () => {
    const rawIndex = buildRawIndexByBasename([
      { name: "camera-a/R5K07537.ARW" },
      { name: "camera-b/R5K07537.ARW" },
    ], RAW_EXTS);
    expect(matchSelectionNameToRaw("R5K07537.JPG", rawIndex)).toMatchObject({
      status: "needs_review",
      candidateNames: ["camera-a/R5K07537.ARW", "camera-b/R5K07537.ARW"],
    });
  });
});

describe("matchSelectionDateTimeToRaw — 파일명이 바뀐 선택본 직접 매칭", () => {
  const DATE = "2026-09-25T11:22:33";

  it("동일 촬영시간의 RAW가 하나면 직접 매칭한다", () => {
    const rawIndex = buildDateTimeIndex([{ name: "R5K07537.ARW", normalizedDateTime: DATE }]);
    expect(matchSelectionDateTimeToRaw("WIN_F_0001.jpg", DATE, rawIndex)).toMatchObject({
      status: "success",
      rawName: "R5K07537.ARW",
    });
  });

  it("동일 촬영시간의 RAW가 2개면 연사 그룹 전부를 직접 매칭한다", () => {
    const rawIndex = buildDateTimeIndex([
      { name: "camera-a/R5K07537.ARW", normalizedDateTime: DATE },
      { name: "camera-b/R5K07538.ARW", normalizedDateTime: DATE },
    ]);
    expect(matchSelectionDateTimeToRaw("WIN_F_0001.jpg", DATE, rawIndex)).toMatchObject({
      status: "success",
      rawName: "camera-a/R5K07537.ARW",
      rawNames: ["camera-a/R5K07537.ARW", "camera-b/R5K07538.ARW"],
      message: "동일 촬영시간 RAW 2장 모두 선택",
    });
  });

  it("동일 촬영시간 RAW가 5개여도 전부 직접 매칭한다", () => {
    const rawIndex = buildDateTimeIndex(Array.from({ length: 5 }, (_, index) => ({
      name: `DSC0790${index + 1}.ARW`,
      normalizedDateTime: DATE,
    })));
    expect(matchSelectionDateTimeToRaw("0921_eNtoB_019.jpg", DATE, rawIndex)).toMatchObject({
      status: "success",
      rawNames: ["DSC07901.ARW", "DSC07902.ARW", "DSC07903.ARW", "DSC07904.ARW", "DSC07905.ARW"],
    });
  });

  it("선택본에 촬영시간이 없으면 메타데이터 누락으로 표시한다", () => {
    expect(matchSelectionDateTimeToRaw("WIN_F_0001.jpg", null, new Map())).toMatchObject({
      status: "metadata_missing",
    });
  });
});

describe("markDuplicateRawMatches — 부분 처리 안전장치", () => {
  it("같은 촬영시간 그룹을 여러 선택본이 참조해도 연사 결과는 유지한다", () => {
    const rows = markDuplicateRawMatches([
      {
        selectionName: "a.jpg",
        status: "success",
        normalizedDateTime: "2026-09-21T19:22:31",
        rawName: "DSC07907.ARW",
        rawNames: ["DSC07907.ARW", "DSC07908.ARW"],
        matchGroupKey: "datetime:2026-09-21T19:22:31",
        message: "성공",
      },
      {
        selectionName: "b.jpg",
        status: "success",
        normalizedDateTime: "2026-09-21T19:22:31",
        rawName: "DSC07907.ARW",
        rawNames: ["DSC07907.ARW", "DSC07908.ARW"],
        matchGroupKey: "datetime:2026-09-21T19:22:31",
        message: "성공",
      },
    ]);
    expect(rows.map((row) => row.status)).toEqual(["success", "success"]);
  });

  it("중복 RAW 행만 확인 필요로 바꾸고 고유 매칭은 유지한다", () => {
    const rows = markDuplicateRawMatches([
      { selectionName: "a.jpg", status: "success", normalizedDateTime: null, rawName: "A.ARW", message: "성공" },
      { selectionName: "b.jpg", status: "success", normalizedDateTime: null, rawName: "nested/A.ARW", message: "성공" },
      { selectionName: "c.jpg", status: "success", normalizedDateTime: null, rawName: "C.ARW", message: "성공" },
      { selectionName: "d.jpg", status: "raw_missing", normalizedDateTime: null, message: "없음" },
    ]);

    expect(rows.map((row) => row.status)).toEqual([
      "needs_review",
      "needs_review",
      "success",
      "raw_missing",
    ]);
  });
});

describe("rawNamesOf / uniqueRawNames", () => {
  it("기존 rawName과 다중 rawNames를 한 배열로 읽는다", () => {
    expect(rawNamesOf({ rawName: "A.ARW" })).toEqual(["A.ARW"]);
    expect(rawNamesOf({ rawName: "A.ARW", rawNames: ["A.ARW", "B.ARW"] })).toEqual(["A.ARW", "B.ARW"]);
  });

  it("같은 RAW 경로의 반복 참조만 NFC·대소문자 기준으로 제거한다", () => {
    expect(uniqueRawNames(["folder/A.ARW", "folder/a.arw", "other/A.ARW"])).toEqual(["folder/A.ARW", "other/A.ARW"]);
  });
});

describe("METADATA_SELECT_JPG_EXTENSIONS", () => {
  it("jpg/jpeg만 포함한다", () => {
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("jpg")).toBe(true);
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("jpeg")).toBe(true);
    expect(METADATA_SELECT_JPG_EXTENSIONS.has("png")).toBe(false);
  });
});
