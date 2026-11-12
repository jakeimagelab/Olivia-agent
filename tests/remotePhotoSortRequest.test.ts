import { describe, expect, it } from "vitest";
import {
  buildRemotePhotoSortPayload,
  resolveRemotePhotoSortStart,
  type RemotePhotoSortStartContext,
} from "@/lib/photo-classifier/remotePhotoSortRequest";

const readyContext: RemotePhotoSortStartContext = {
  sourceFolder: "촬영/프로젝트",
  shootingMode: "field",
  departmentResolved: true,
  workerOffline: false,
  workFolderStatus: "available",
  workFolderReady: true,
  jobActive: false,
};

describe("resolveRemotePhotoSortStart", () => {
  it("allows a verified idle request", () => {
    expect(resolveRemotePhotoSortStart(readyContext)).toEqual({ allowed: true });
  });

  it("asks for a department before a field request", () => {
    expect(resolveRemotePhotoSortStart({
      ...readyContext,
      departmentResolved: false,
    })).toMatchObject({
      allowed: false,
      reason: "department_unresolved",
      openDepartmentPicker: true,
    });
  });

  it("keeps an active request silent", () => {
    expect(resolveRemotePhotoSortStart({
      ...readyContext,
      jobActive: true,
    })).toMatchObject({
      allowed: false,
      reason: "job_active",
      message: null,
    });
  });

  it("preserves the work-folder error detail", () => {
    expect(resolveRemotePhotoSortStart({
      ...readyContext,
      workFolderStatus: "error",
      workFolderMessage: "권한 없음",
    })).toMatchObject({
      allowed: false,
      reason: "work_folder_error",
      message: "Agentstation 작업본을 확인하지 못했습니다 — 권한 없음",
    });
  });
});

describe("buildRemotePhotoSortPayload", () => {
  const common = {
    sourceFolder: "촬영/프로젝트",
    department: "dermatology",
    studioGapMinutes: 7,
    fieldGapMinutes: 3.5,
    classificationUiMode: "ai-auto" as const,
    fastAnalyzeMode: true,
    departmentLogicEnabled: true,
    aiNamingEnabled: false,
    qualityAnalysisEnabled: true,
    profileClassificationEnabled: false,
  };

  it("uses the field gap for a field request", () => {
    expect(buildRemotePhotoSortPayload({
      ...common,
      shootingMode: "field",
    })).toMatchObject({
      source_folder: "촬영/프로젝트",
      shooting_mode: "field",
      gap_minutes: 3.5,
    });
  });

  it("uses the studio gap for a studio request", () => {
    expect(buildRemotePhotoSortPayload({
      ...common,
      shootingMode: "studio",
    })).toMatchObject({
      shooting_mode: "studio",
      gap_minutes: 7,
    });
  });
});
