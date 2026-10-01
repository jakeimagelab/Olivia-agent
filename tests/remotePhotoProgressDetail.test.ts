import { describe, expect, it } from "vitest";
import {
  REMOTE_PHOTO_PROGRESS_STEPS,
  remotePhotoProgressPercent,
  remotePhotoProgressStepState,
  remotePhotoProgressSummary,
} from "@/lib/photo-classifier/remotePhotoProgressDetail";

describe("remote photo progress detail", () => {
  it("shows JPG-only copy verification separately from final scene verification", () => {
    const copying = {
      status: "RUNNING",
      progress: { stage: "COPY_VERIFYING" as const, current: 12, total: 24, message: "JPG 복사본 검증 중" },
    };
    expect(REMOTE_PHOTO_PROGRESS_STEPS.map((step) => step.label)).toEqual([
      "NAS JPG전체 확인",
      "Agentstation JPG 복사",
      "복사본 무결성 검증",
      "복사된 JPG 스캔",
      "사진 특징 분석",
      "씬 경계·이름 분석",
      "씬별분류 복사",
      "최종 검증",
    ]);
    expect(remotePhotoProgressStepState(copying, REMOTE_PHOTO_PROGRESS_STEPS[0]!)).toBe("completed");
    expect(remotePhotoProgressStepState(copying, REMOTE_PHOTO_PROGRESS_STEPS[2]!)).toBe("current");
    expect(remotePhotoProgressStepState(copying, REMOTE_PHOTO_PROGRESS_STEPS[7]!)).toBe("pending");
    expect(remotePhotoProgressPercent(copying.progress)).toBe(50);
  });

  it("keeps terminal failure detail without claiming the source was changed", () => {
    const failed = {
      status: "FAILED",
      progress: { stage: "ORGANIZING" as const, message: "씬별분류 복사 중" },
      error: "대상 경로를 검증하지 못했습니다.",
    };
    expect(remotePhotoProgressStepState(failed, REMOTE_PHOTO_PROGRESS_STEPS[6]!)).toBe("failed");
    expect(remotePhotoProgressSummary(failed)).toBe("대상 경로를 검증하지 못했습니다.");
  });
});
