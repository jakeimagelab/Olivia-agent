import { runPhotoClassifyWork, type PhotoClassifyWorkResult } from "./photoClassifyWork";
import { stageProjectJpgToWorkStorage, type PhotoStageJpgResult } from "./photoJpgStager";
import { getStorageRoots } from "./storageConfig";
import type { RemotePhotoSortRunnerOptions, RunnerProgress, RunnerRoots } from "./types";

/**
 * 원격 사진 분류 화면의 단일 실행 경로.
 *
 * NAS 프로젝트 전체를 Agentstation으로 복제하지 않는다. 오직 `JPG전체`만
 * `Agentstation/<project>/JPG전체`로 안전 복사하고, 그 복사본을 읽기 전용으로
 * 씬별분류에 복제한다. RAW는 이 파이프라인에서 열거나 스캔하지 않는다.
 */
export type RemoteJpgClassificationPipelineInput = RemotePhotoSortRunnerOptions & {
  sourceFolder: string;
  roots?: RunnerRoots;
  minFreeBytes?: number;
};

export type RemoteJpgClassificationPipelineSuccess = {
  ok: true;
  status: "CLASSIFY_COMPLETED";
  sourceFolder: string;
  workFolder: string;
  jpgCount: number;
  sceneCount: number;
  copiedCount: number;
  alreadyCopiedCount: number;
  durationMs: number;
  copy: Extract<PhotoStageJpgResult, { ok: true }>;
  classification: Extract<PhotoClassifyWorkResult, { ok: true }>;
};

export type RemoteJpgClassificationPipelineFailure = {
  ok: false;
  status: "COPY_FAILED" | "REVIEW_REQUIRED" | "CLASSIFY_FAILED";
  sourceFolder: string;
  error: string;
  copy?: PhotoStageJpgResult;
  classification?: PhotoClassifyWorkResult;
};

export type RemoteJpgClassificationPipelineResult =
  | RemoteJpgClassificationPipelineSuccess
  | RemoteJpgClassificationPipelineFailure;

export async function runRemoteJpgClassificationPipeline(
  input: RemoteJpgClassificationPipelineInput,
  dependencies: { onProgress?: (progress: RunnerProgress) => void } = {},
): Promise<RemoteJpgClassificationPipelineResult> {
  const startedAt = Date.now();
  const roots = input.roots ?? getStorageRoots();
  const onProgress = dependencies.onProgress;

  onProgress?.({
    stage: "PREPARING",
    message: "NAS의 JPG전체만 Agentstation 작업본으로 준비합니다. RAW는 읽지 않습니다.",
  });

  const copy = await stageProjectJpgToWorkStorage({
    sourceRelativePath: input.sourceFolder,
    destinationRelativePath: input.sourceFolder,
    roots,
    minFreeBytes: input.minFreeBytes,
    onProgress,
  });
  if (!copy.ok) {
    return {
      ok: false,
      status: copy.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "COPY_FAILED",
      sourceFolder: input.sourceFolder,
      error: copy.error,
      copy,
    };
  }

  onProgress?.({
    stage: "SCANNING",
    current: 0,
    total: copy.destinationJpgCount,
    message: "Agentstation JPG 복사본으로 사진 분류를 시작합니다.",
  });
  const classification = await runPhotoClassifyWork({
    workRelativePath: input.sourceFolder,
    expectedJpgCount: copy.destinationJpgCount,
    expectedJpgBytes: copy.destinationJpgBytes,
    roots,
    minFreeBytes: input.minFreeBytes,
    department: input.department,
    gapMinutes: input.gapMinutes,
    classificationUiMode: input.classificationUiMode,
    fastAnalyzeMode: input.fastAnalyzeMode,
    departmentLogicEnabled: input.departmentLogicEnabled,
    aiNamingEnabled: input.aiNamingEnabled,
    qualityAnalysisEnabled: input.qualityAnalysisEnabled,
    profileClassificationEnabled: input.profileClassificationEnabled,
    only: input.only,
  }, { onProgress });

  if (!classification.ok) {
    return {
      ok: false,
      status: classification.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "CLASSIFY_FAILED",
      sourceFolder: input.sourceFolder,
      error: classification.error,
      copy,
      classification,
    };
  }

  return {
    ok: true,
    status: "CLASSIFY_COMPLETED",
    sourceFolder: input.sourceFolder,
    workFolder: input.sourceFolder,
    jpgCount: classification.jpgCount,
    sceneCount: classification.sceneCount,
    copiedCount: copy.copiedCount,
    alreadyCopiedCount: copy.alreadyCopiedCount,
    durationMs: Date.now() - startedAt,
    copy,
    classification,
  };
}
