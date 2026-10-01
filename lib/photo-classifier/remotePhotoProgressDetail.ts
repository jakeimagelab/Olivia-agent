import type { RemoteJobProgress, RemoteJobProgressStage } from "@/lib/remote-jobs/progress";

export type RemotePhotoProgressDetailInput = {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED" | string;
  progress: RemoteJobProgress | null | undefined;
  message?: string | null;
  error?: string | null;
  cancelRequested?: boolean;
};

export type RemotePhotoProgressStepState = "pending" | "current" | "completed" | "failed" | "cancelled";

export type RemotePhotoProgressStep = {
  id: string;
  label: string;
  detail: string;
  stages: readonly RemoteJobProgressStage[];
};

/**
 * 원격 사진 분류는 창 수명과 무관하게 동일한 순서로 실행된다.
 * UI는 현재 progress 한 건만 받아도 이 고정 단계표를 사용해 전체 과정을 설명한다.
 */
export const REMOTE_PHOTO_PROGRESS_STEPS: readonly RemotePhotoProgressStep[] = [
  {
    id: "source-check",
    label: "NAS JPG전체 확인",
    detail: "선택한 촬영 폴더의 JPG/JPEG만 확인합니다. RAW는 읽거나 복사하지 않습니다.",
    stages: ["STAGING", "PREPARING"],
  },
  {
    id: "copy",
    label: "Agentstation JPG 복사",
    detail: "JPG/JPEG만 Agentstation 작업본으로 안전하게 복사합니다.",
    stages: ["COPYING"],
  },
  {
    id: "copy-verify",
    label: "복사본 무결성 검증",
    detail: "파일 수·용량을 확인하고 기존 파일은 SHA-256이 일치할 때만 재사용합니다.",
    stages: ["COPY_VERIFYING"],
  },
  {
    id: "scan",
    label: "복사된 JPG 스캔",
    detail: "Agentstation의 JPG 작업본을 읽기 전용으로 스캔합니다.",
    stages: ["SCANNING"],
  },
  {
    id: "analyze",
    label: "사진 특징 분석",
    detail: "촬영 시간과 장면 특징을 분석합니다.",
    stages: ["ANALYZING", "FEATURE_EXTRACTION"],
  },
  {
    id: "scene",
    label: "씬 경계·이름 분석",
    detail: "장면 경계를 확정하고 시술·상담 등 씬 이름을 제안합니다.",
    stages: ["SCENE_ANALYSIS", "BOUNDARY_ANALYSIS"],
  },
  {
    id: "organize",
    label: "씬별분류 복사",
    detail: "JPG 작업본을 건드리지 않고 씬별분류에 결과만 복사합니다.",
    stages: ["ORGANIZING"],
  },
  {
    id: "final-verify",
    label: "최종 검증",
    detail: "씬별분류의 파일 수와 원본 JPG 구성이 일치하는지 확인합니다.",
    stages: ["FINAL_VERIFYING", "VERIFYING"],
  },
];

function activeStepIndex(stage: RemoteJobProgressStage | undefined): number {
  if (!stage) return -1;
  return REMOTE_PHOTO_PROGRESS_STEPS.findIndex((step) => step.stages.includes(stage));
}

export function remotePhotoProgressStepState(
  input: RemotePhotoProgressDetailInput,
  step: RemotePhotoProgressStep,
): RemotePhotoProgressStepState {
  if (input.status === "FAILED") return step.id === REMOTE_PHOTO_PROGRESS_STEPS.at(activeStepIndex(input.progress?.stage))?.id ? "failed" : "pending";
  if (input.status === "CANCELED") return step.id === REMOTE_PHOTO_PROGRESS_STEPS.at(activeStepIndex(input.progress?.stage))?.id ? "cancelled" : "pending";
  if (input.status === "COMPLETED") return "completed";

  const index = REMOTE_PHOTO_PROGRESS_STEPS.findIndex((candidate) => candidate.id === step.id);
  const activeIndex = activeStepIndex(input.progress?.stage);
  if (activeIndex < 0) return index === 0 ? "current" : "pending";
  if (index < activeIndex) return "completed";
  if (index === activeIndex) return "current";
  return "pending";
}

export function remotePhotoProgressSummary(input: RemotePhotoProgressDetailInput): string {
  if (input.status === "COMPLETED") return "사진 분류와 최종 검증이 완료되었습니다.";
  if (input.status === "FAILED") return input.error || input.message || "작업이 중단되었습니다. 원본 JPG는 변경하지 않았습니다.";
  if (input.status === "CANCELED") return input.message || "작업을 취소했습니다. NAS 원본과 Agentstation의 검증된 JPG 작업본은 유지됩니다.";
  if (input.cancelRequested) return "취소 요청을 확인했습니다. 현재 파일 작업을 안전하게 멈추는 중입니다.";
  return input.progress?.message || input.message || "Mac Studio 작업 시작을 기다리고 있습니다.";
}

export function remotePhotoProgressPercent(progress: RemoteJobProgress | null | undefined): number | null {
  if (!progress || progress.current === undefined || !progress.total || progress.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)));
}
