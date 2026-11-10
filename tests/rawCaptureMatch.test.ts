import { describe, expect, it } from "vitest";
import {
  buildCaptureMatchPreflight,
  buildMatchLogCsv,
  isCaptureMatchTargetCountConsistent,
  resolveCaptureMatchJpgSources,
  resolveCaptureTimeCandidate,
  type CaptureMatchPreflight,
  type JpgMatchSource,
} from "@/lib/selectMatch/captureMatch";
import { resolveRawMatchTargets } from "@/lib/photo-bridge/rawMatchDelivery";
import { parseCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";

function capture(timestampMs: number, hasSubseconds = false): CaptureTime {
  return {
    timestampMs,
    dateTimeOriginal: "2026:11:10 10:00:00",
    subSecTimeOriginal: hasSubseconds ? String(timestampMs % 1000).padStart(3, "0") : null,
    hasSubseconds,
  };
}

function makeTiff(date = "2026:11:10 10:00:00", subsec = "250"): ArrayBuffer {
  const buffer = new ArrayBuffer(96);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, 2, true);
  view.setUint16(28, 0x9003, true);
  view.setUint16(30, 2, true);
  view.setUint32(32, 20, true);
  view.setUint32(36, 58, true);
  view.setUint16(40, 0x9291, true);
  view.setUint16(42, 2, true);
  view.setUint32(44, subsec.length + 1, true);
  for (const [index, value] of encoder.encode(`${subsec}\0`).entries()) view.setUint8(48 + index, value);
  view.setUint32(52, 0, true);
  for (const [index, value] of encoder.encode(`${date}\0`).entries()) view.setUint8(58 + index, value);
  return buffer;
}

describe("RAW 촬영시각 안전 매칭", () => {
  it("같은 이름 RAW 2개 중 촬영시각이 맞는 1개만 확정한다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      candidates: [
        { id: "wrong", captureTime: capture(30_000) },
        { id: "right", captureTime: capture(11_000) },
      ],
    });
    expect(result).toMatchObject({ status: "confirmed", confirmedCandidateId: "right" });
  });

  it("같은 이름 RAW 1개라도 촬영시각이 10초 차이면 확정하지 않는다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      candidates: [{ id: "raw", captureTime: capture(20_000) }],
    });
    expect(result).toMatchObject({ status: "time_mismatch", confirmedCandidateId: null });
  });

  it("촬영시각이 같은 후보가 2개면 후보 여러 개로 분류한다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      candidates: [
        { id: "a", captureTime: capture(10_000) },
        { id: "b", captureTime: capture(10_000) },
      ],
    });
    expect(result).toMatchObject({ status: "multiple_candidates", confirmedCandidateId: null });
  });

  it("촬영시각과 크기가 같은 RAW 복사본은 JPG와 같은 이름 폴더 경로 하나로 확정한다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      jpgRelativePath: "JPG전체/정연호/_AK_0008.JPG",
      candidates: [
        { id: "first", captureTime: capture(10_000), fileSize: 12_345, relativePath: "RAW/백업/_AK_0008.CR2" },
        { id: "same-folder", captureTime: capture(10_000), fileSize: 12_345, relativePath: "RAW/정연호/_AK_0008.CR2" },
      ],
    });
    expect(result).toMatchObject({ status: "confirmed", confirmedCandidateId: "same-folder" });
  });

  it("촬영시각이 같아도 크기가 다른 RAW는 후보 여러 개로 남긴다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      candidates: [
        { id: "small", captureTime: capture(10_000), fileSize: 12_345 },
        { id: "large", captureTime: capture(10_000), fileSize: 54_321 },
      ],
    });
    expect(result).toMatchObject({ status: "multiple_candidates", confirmedCandidateId: null });
  });

  it("JPG나 RAW 촬영시각을 못 읽으면 기본은 복사하지 않는다", () => {
    expect(resolveCaptureTimeCandidate({
      jpgCaptureTime: null,
      candidates: [{ id: "raw", captureTime: capture(10_000) }],
    }).status).toBe("missing_time");
    expect(resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_000),
      candidates: [{ id: "raw", captureTime: null }],
    }).status).toBe("missing_time");
  });

  it("양쪽에 소수초가 있으면 가장 가까운 유일 후보를 확정한다", () => {
    const result = resolveCaptureTimeCandidate({
      jpgCaptureTime: capture(10_250, true),
      candidates: [
        { id: "a", captureTime: capture(10_100, true) },
        { id: "b", captureTime: capture(10_240, true) },
      ],
    });
    expect(result).toMatchObject({ status: "confirmed", confirmedCandidateId: "b" });
  });

  it("TIFF/RAW EXIF의 DateTimeOriginal과 SubSecTimeOriginal을 읽는다", () => {
    const parsed = parseCaptureTime(makeTiff());
    expect(parsed?.dateTimeOriginal).toBe("2026:11:10 10:00:00");
    expect(parsed?.subSecTimeOriginal).toBe("250");
    expect(parsed?.hasSubseconds).toBe(true);
  });

  it("CR3 CMT1 영역처럼 파일 중간에 든 TIFF EXIF도 읽는다", () => {
    const tiff = new Uint8Array(makeTiff());
    const wrapped = new Uint8Array(32 + tiff.length);
    wrapped.set(new TextEncoder().encode("CMT1"), 12);
    wrapped.set(tiff, 32);
    expect(parseCaptureTime(wrapped.buffer)?.subSecTimeOriginal).toBe("250");
  });

  it("복수 후보 RawIndexEntry[]를 읽어 유일한 촬영시각 후보만 사전 확정한다", async () => {
    const handle = (name: string, data: ArrayBuffer) => ({
      name,
      kind: "file",
      getFile: async () => new File([data], name),
    }) as unknown as FileSystemFileHandle;
    const directory = { name: "RAW", kind: "directory" } as FileSystemDirectoryHandle;
    const jpg = handle("_AK_0008.JPG", makeTiff("2026:11:10 10:00:00", "250"));
    const right = handle("_AK_0008.CR2", makeTiff("2026:11:10 10:00:00", "260"));
    const wrong = handle("_AK_0008.CR2", makeTiff("2026:11:10 10:00:10", "250"));
    const preflight = await buildCaptureMatchPreflight({
      jpgSources: [{ id: "JPG/_AK_0008.JPG", name: "_AK_0008.JPG", basename: "_ak_0008", relativePath: "JPG/_AK_0008.JPG", handle: jpg, thumbUrl: null }],
      rawIndex: new Map([["_ak_0008", [
        { fileHandle: wrong, dirHandle: directory, relativePath: "RAW/person-a/_AK_0008.CR2" },
        { fileHandle: right, dirHandle: directory, relativePath: "RAW/person-b/_AK_0008.CR2" },
      ]]]),
    });
    expect(preflight).toMatchObject({ confirmed: 1, multipleCandidates: 0, timeMismatch: 0 });
    expect(preflight.items[0].candidates.find((candidate) => candidate.id === preflight.items[0].confirmedCandidateId)?.entry.relativePath).toContain("person-b");
  });

  it("매칭 로그 CSV에 경로·촬영시각·결과를 남긴다", () => {
    const csv = buildMatchLogCsv([{
      jpgName: "_AK_0008.JPG",
      jpgPath: "JPG/C1/_AK_0008.JPG",
      jpgCaptureTime: capture(10_250, true),
      rawPath: "RAW/C1/_AK_0008.CR2",
      rawCaptureTime: capture(10_260, true),
      result: "확정",
    }]);
    expect(csv).toContain("JPG/C1/_AK_0008.JPG");
    expect(csv).toContain("RAW/C1/_AK_0008.CR2");
    expect(csv).toContain("확정");
  });

  it("기준 결과 22장만 사전 확인 대상으로 쓰고 하위 폴더 추가 별점 18장은 합치지 않는다", () => {
    const targetNames = Array.from({ length: 22 }, (_, index) => `TARGET_${index + 1}.JPG`);
    const extraNames = Array.from({ length: 18 }, (_, index) => `EXTRA_${index + 1}.JPG`);
    const ratingsByName = Object.fromEntries([...targetNames, ...extraNames].map((name) => [name, 5]));
    const targets = resolveRawMatchTargets({
      names: targetNames,
      ratingsByName,
      colorsByName: {},
      criteria: { source: "rating", minRating: 1, colorLabels: [6, 7, 8, 9] },
    });
    const handle = { kind: "file", name: "placeholder.JPG" } as FileSystemFileHandle;
    const sources = [...targetNames, ...extraNames].map((name) => ({
      id: `folder/${name}`,
      name,
      basename: name.replace(/\.[^.]+$/u, ""),
      relativePath: `folder/${name}`,
      handle,
      thumbUrl: null,
    })) satisfies JpgMatchSource[];

    expect(targets.size).toBe(22);
    expect(resolveCaptureMatchJpgSources({ targetBasenames: targets, sources })).toHaveLength(22);
  });

  it("N차보정본 안 JPG와 같은 basename 중복은 사전 확인 대상에서 제외한다", () => {
    const handle = { kind: "file", name: "A.JPG" } as FileSystemFileHandle;
    const sources: JpgMatchSource[] = [
      { id: "1차보정본/A.JPG", name: "A.JPG", basename: "a", relativePath: "1차보정본/A.JPG", handle, thumbUrl: null },
      { id: "현재/A.JPG", name: "A.JPG", basename: "a", relativePath: "현재/A.JPG", handle, thumbUrl: null },
      { id: "2차보정본/B.JPG", name: "B.JPG", basename: "b", relativePath: "2차보정본/B.JPG", handle, thumbUrl: null },
    ];
    expect(resolveCaptureMatchJpgSources({ targetBasenames: new Set(["a", "b"]), sources }).map((source) => source.id)).toEqual(["현재/A.JPG"]);
  });

  it("사전 확인 항목 수나 상태 합계가 기준 수와 다르면 실행 불가로 판정한다", () => {
    const preflight = {
      items: [{ id: "only-one" }],
      rawFound: 1,
      confirmed: 1,
      timeMismatch: 0,
      multipleCandidates: 0,
      missingTime: 0,
      rawMissing: 0,
    } as unknown as CaptureMatchPreflight;
    expect(isCaptureMatchTargetCountConsistent(2, preflight)).toBe(false);
    expect(isCaptureMatchTargetCountConsistent(1, { ...preflight, rawMissing: 1 })).toBe(false);
    expect(isCaptureMatchTargetCountConsistent(1, preflight)).toBe(true);
  });
});
