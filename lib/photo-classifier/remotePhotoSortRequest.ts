import type { RemotePhotoSortPayload } from "@/lib/photo-classifier/remotePhotoSort";

export type RemotePhotoSortStartDecision =
  | { allowed: true }
  | {
    allowed: false;
    reason:
      | "missing_source"
      | "department_unresolved"
      | "worker_offline"
      | "work_folder_checking"
      | "work_folder_error"
      | "work_folder_unverified"
      | "job_active";
    message: string | null;
    openDepartmentPicker: boolean;
  };

export type RemotePhotoSortStartContext = {
  sourceFolder: string | null | undefined;
  shootingMode: RemotePhotoSortPayload["shooting_mode"];
  departmentResolved: boolean;
  workerOffline: boolean;
  workFolderStatus: "idle" | "checking" | "available" | "resume" | "error";
  workFolderMessage?: string;
  workFolderReady: boolean;
  jobActive: boolean;
};

export function resolveRemotePhotoSortStart(
  context: RemotePhotoSortStartContext,
): RemotePhotoSortStartDecision {
  if (!context.sourceFolder) {
    return {
      allowed: false,
      reason: "missing_source",
      message: "NAS Root가 아닌 촬영 폴더를 선택해주세요.",
      openDepartmentPicker: false,
    };
  }

  if (context.shootingMode === "field" && !context.departmentResolved) {
    return {
      allowed: false,
      reason: "department_unresolved",
      message: "진료과를 확인해야 분류를 시작할 수 있습니다.",
      openDepartmentPicker: true,
    };
  }

  if (context.workerOffline) {
    return {
      allowed: false,
      reason: "worker_offline",
      message: "Mac Studio 연결을 확인해주세요.",
      openDepartmentPicker: false,
    };
  }

  if (context.workFolderStatus === "checking" || context.workFolderStatus === "idle") {
    return {
      allowed: false,
      reason: "work_folder_checking",
      message: "Agentstation 작업본을 확인 중입니다. 확인이 끝난 뒤 시작해주세요.",
      openDepartmentPicker: false,
    };
  }

  if (context.workFolderStatus === "error") {
    return {
      allowed: false,
      reason: "work_folder_error",
      message: `Agentstation 작업본을 확인하지 못했습니다 — ${context.workFolderMessage ?? "알 수 없는 오류"}`,
      openDepartmentPicker: false,
    };
  }

  if (!context.workFolderReady) {
    return {
      allowed: false,
      reason: "work_folder_unverified",
      message: "선택한 NAS 폴더의 Agentstation 작업본 확인이 필요합니다.",
      openDepartmentPicker: false,
    };
  }

  if (context.jobActive) {
    return {
      allowed: false,
      reason: "job_active",
      message: null,
      openDepartmentPicker: false,
    };
  }

  return { allowed: true };
}

export function buildRemotePhotoSortPayload(input: {
  sourceFolder: string;
  shootingMode: RemotePhotoSortPayload["shooting_mode"];
  department: string;
  studioGapMinutes: number;
  fieldGapMinutes: number;
  classificationUiMode: RemotePhotoSortPayload["classification_ui_mode"];
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
}): RemotePhotoSortPayload {
  return {
    source_folder: input.sourceFolder,
    shooting_mode: input.shootingMode,
    department: input.department,
    gap_minutes: input.shootingMode === "studio"
      ? input.studioGapMinutes
      : input.fieldGapMinutes,
    classification_ui_mode: input.classificationUiMode,
    fast_analyze_mode: input.fastAnalyzeMode,
    department_logic_enabled: input.departmentLogicEnabled,
    ai_naming_enabled: input.aiNamingEnabled,
    quality_analysis_enabled: input.qualityAnalysisEnabled,
    profile_classification_enabled: input.profileClassificationEnabled,
  };
}
