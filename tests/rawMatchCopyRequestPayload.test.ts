import { describe, expect, it } from "vitest";
import { normalizeRawMatchCopyRequestPayload } from "@/lib/remote-jobs/rawMatchCopyRequestPayload";

function validPayload() {
  return {
    rawRootPath: "/Volumes/Agentstation/촬영/RAW/",
    jpgRootPath: "/Volumes/Agentstation/촬영/JPG전체",
    items: [{
      rawPath: "사람/A.CR2",
      destDir: "Selected_RAW",
      rawExpectedSize: 1234,
      rawExpectedCaptureTimeMs: null,
      jpgPath: "사람/A.JPG",
      jpgDestDir: "1차보정본",
      jpgExpectedSize: 456,
      jpgExpectedCaptureTimeMs: null,
    }],
    logRows: [{
      jpgName: "A.JPG",
      jpgPath: "사람/A.JPG",
      jpgCaptureTime: "2026-11-14 10:00:00",
      rawPath: "사람/A.CR2",
      rawCaptureTime: "2026-11-14 10:00:00",
      result: "확정",
    }],
    openOutput: true,
  };
}

describe("PHOTO_RAW_MATCH_COPY payload", () => {
  it("절대경로 없이 폴더 식별 정보를 정규화한다", () => {
    const payload = validPayload();
    delete (payload as Partial<typeof payload>).rawRootPath;
    delete (payload as Partial<typeof payload>).jpgRootPath;
    Object.assign(payload, {
      rawRoot: { projectKey: "1114-서울", folderName: " 1114_서울예방치과교실 ", kind: "raw" },
      jpgRoot: { projectKey: "1114-서울", folderName: "단체사진", relativePath: "JPG전체/단체사진", kind: "jpg" },
    });

    expect(normalizeRawMatchCopyRequestPayload(payload)).toMatchObject({
      rawRoot: { projectKey: "1114-서울", folderName: "1114_서울예방치과교실", kind: "raw" },
      jpgRoot: { projectKey: "1114-서울", folderName: "단체사진", relativePath: "JPG전체/단체사진", kind: "jpg" },
    });
  });

  it("normalizes roots, copy defaults, samples, and log rows", () => {
    expect(normalizeRawMatchCopyRequestPayload(validPayload())).toEqual({
      rawRootPath: "/Volumes/Agentstation/촬영/RAW",
      jpgRootPath: "/Volumes/Agentstation/촬영/JPG전체",
      items: [{
        rawPath: "사람/A.CR2",
        destDir: "Selected_RAW",
        rawAction: "copy",
        rawExpectedSize: 1234,
        rawExpectedCaptureTimeMs: null,
        jpgPath: "사람/A.JPG",
        jpgDestDir: "1차보정본",
        jpgExpectedSize: 456,
        jpgExpectedCaptureTimeMs: null,
      }],
      logRows: [{
        jpgName: "A.JPG",
        jpgPath: "사람/A.JPG",
        jpgCaptureTime: "2026-11-14 10:00:00",
        rawPath: "사람/A.CR2",
        rawCaptureTime: "2026-11-14 10:00:00",
        result: "확정",
      }],
      openOutput: true,
    });
  });

  it("keeps an explicit RAW move action", () => {
    const payload = validPayload();
    (payload.items[0] as Record<string, unknown>).rawAction = "move";
    expect(normalizeRawMatchCopyRequestPayload(payload).items).toEqual([
      expect.objectContaining({ rawAction: "move" }),
    ]);
  });

  it("rejects incomplete JPG sample metadata", () => {
    const payload = validPayload();
    delete (payload.items[0] as Partial<(typeof payload.items)[number]>).jpgExpectedSize;
    expect(() => normalizeRawMatchCopyRequestPayload(payload)).toThrow("JPG 표본 정보");
  });

  it("RAW 복사만 할 때 JPG 표본은 유지하고 상위 폴더 범위를 두 단계로 제한한다", () => {
    const payload = { ...validPayload(), rawRootRelation: { parentSteps: 2, subdirectory: "RAW" } };
    delete (payload.items[0] as Partial<(typeof payload.items)[number]>).jpgDestDir;
    const normalized = normalizeRawMatchCopyRequestPayload(payload);
    expect(normalized).toMatchObject({ rawRootRelation: { parentSteps: 2, subdirectory: "RAW" }, items: [{ jpgPath: "사람/A.JPG", jpgExpectedSize: 456 }] });
    expect((normalized.items as Record<string, unknown>[])[0]).not.toHaveProperty("jpgDestDir");
    payload.rawRootRelation.parentSteps = 3;
    expect(() => normalizeRawMatchCopyRequestPayload(payload)).toThrow(/JPG 상위 폴더 단계/u);
  });

  it("rejects unsafe worker paths and unknown log results", () => {
    const unsafe = validPayload();
    unsafe.items[0].rawPath = "../outside.CR2";
    expect(() => normalizeRawMatchCopyRequestPayload(unsafe)).toThrow("올바르지 않습니다");

    const unknown = validPayload();
    unknown.logRows[0].result = "복사함";
    expect(() => normalizeRawMatchCopyRequestPayload(unknown)).toThrow("result");
  });
});
