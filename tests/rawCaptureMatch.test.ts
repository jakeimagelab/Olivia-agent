import { describe, expect, it } from "vitest";
import { buildCaptureMatchPreflight, buildMatchLogCsv, resolveCaptureTimeCandidate } from "@/lib/selectMatch/captureMatch";
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
});
