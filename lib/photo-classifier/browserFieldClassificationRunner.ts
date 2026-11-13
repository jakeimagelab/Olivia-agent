import { buildVisualBoundaryCandidates, sortTimestampedFiles } from "./candidate-builder";
import { getClassificationSettings } from "./classification-settings";
import { extractBrowserFieldFeatures } from "./fieldFeatureExtraction";
import { appendBrowserPurposeTransitionCandidates } from "./fieldBoundaryAnalysis";
import { verifyBrowserFieldBoundaries } from "./fieldBoundaryVerification";
import { readBrowserPhotoTimestamps } from "./fieldScanning";
import type { ClassificationJobState, SceneBoundaryDecision } from "./hybrid-types";
import type { SceneWeightProfile } from "./pattern-analysis";
import { buildFastFieldScenes, buildFieldScenesFromBoundaries } from "./scene-builder";
import { loadThumb, mapWithConcurrency } from "./browserProcessing";
import { splitRawAndJpg, type SplitRawFile } from "./browserFileOps";
import type { FieldScene, MedicalDepartment, SceneFile } from "./types";
import { estimatedRemaining } from "./workspaceFormatting";

export type BrowserFieldClassificationProgress = {
  cur: number;
  total: number;
  msg: string;
};

export type BrowserFieldClassificationResult = {
  status: "done" | "cancelled";
  rawFiles: SplitRawFile[];
  scenes: FieldScene[];
  boundaryDecisions: SceneBoundaryDecision[];
  logs: string[];
  total: number;
};

type RunnerDependencies = {
  splitFiles: typeof splitRawAndJpg;
  readTimestamps: typeof readBrowserPhotoTimestamps;
  extractFeatures: typeof extractBrowserFieldFeatures;
  appendPurposeCandidates: typeof appendBrowserPurposeTransitionCandidates;
  verifyBoundaries: typeof verifyBrowserFieldBoundaries;
  loadThumbnail: typeof loadThumb;
};

const DEFAULT_DEPENDENCIES: RunnerDependencies = {
  splitFiles: splitRawAndJpg,
  readTimestamps: readBrowserPhotoTimestamps,
  extractFeatures: extractBrowserFieldFeatures,
  appendPurposeCandidates: appendBrowserPurposeTransitionCandidates,
  verifyBoundaries: verifyBrowserFieldBoundaries,
  loadThumbnail: loadThumb,
};

export async function runBrowserFieldClassification({
  rootDirectory,
  department,
  gapMinutes,
  fastAnalyzeMode,
  aiNamingEnabled,
  departmentLogicEnabled,
  weightProfile,
  signal,
  isCancelled,
  onStateChange,
  onProgress,
  onFilesScanned,
  dependencies,
}: {
  rootDirectory: FileSystemDirectoryHandle;
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  aiNamingEnabled: boolean;
  departmentLogicEnabled: boolean;
  weightProfile: SceneWeightProfile | null;
  signal: AbortSignal;
  isCancelled: () => boolean;
  onStateChange?: (state: ClassificationJobState) => void;
  onProgress?: (progress: BrowserFieldClassificationProgress) => void;
  onFilesScanned?: (rawFiles: SplitRawFile[]) => void;
  dependencies?: Partial<RunnerDependencies>;
}): Promise<BrowserFieldClassificationResult> {
  const runtime = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const effectiveGapMinutes = weightProfile?.absoluteTimeGapMinutes ?? gapMinutes;
  const preciseSettings = {
    ...getClassificationSettings(department === "dermatology" ? "dermatology" : "default", "precise"),
    ...(weightProfile ? {
      splitThreshold: weightProfile.splitThreshold,
      reviewThreshold: weightProfile.reviewThreshold,
    } : {}),
  };

  onStateChange?.("SCANNING_FILES");
  onProgress?.({ cur: 0, total: 0, msg: "폴더 스캔 중..." });
  let lastUpdate = Date.now();
  const { rawFiles, jpgFiles } = await runtime.splitFiles(rootDirectory);

  onStateChange?.("READING_EXIF");
  const jpgEntries = await runtime.readTimestamps(jpgFiles, {
    onProgress: ({ completed, total, fileName }) => {
      if (completed === total || completed % 20 === 0 || Date.now() - lastUpdate > 300) {
        onProgress?.({ cur: completed, total, msg: `촬영시각 확인: ${fileName}` });
        lastUpdate = Date.now();
      }
    },
  });
  onFilesScanned?.(rawFiles);

  jpgEntries.splice(0, jpgEntries.length, ...sortTimestampedFiles(jpgEntries));
  const total = jpgEntries.length;

  if (fastAnalyzeMode) {
    const sceneFiles: SceneFile[] = [];
    let done = 0;
    for (const entry of jpgEntries) {
      if (isCancelled()) break;
      done += 1;
      if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
        onProgress?.({ cur: done, total, msg: `씬 계획 생성 (${done}/${total})` });
        lastUpdate = Date.now();
      }
      sceneFiles.push({
        name: entry.name,
        basename: entry.name.replace(/\.[^.]+$/u, ""),
        handle: entry.handle,
        mtime: entry.mtime,
        thumbUrl: null,
      });
    }
    const scenes = buildFastFieldScenes(sceneFiles, effectiveGapMinutes, {
      nameLoading: aiNamingEnabled || departmentLogicEnabled,
    });
    return {
      status: "done",
      rawFiles,
      scenes,
      boundaryDecisions: [],
      logs: [
        `✅ 빠른 분석 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${scenes.length}개`,
        "📋 파일 이동 없음 — Scene 계획만 생성됨 (RAW 원본 위치 유지)",
        "👆 씬 검토 후 [폴더 정리 실행]을 눌러 실제 파일을 정리하세요",
      ],
      total,
    };
  }

  onStateChange?.("EXTRACTING_FEATURES");
  onProgress?.({ cur: 0, total, msg: "저비용 시각 특징 추출 준비 중..." });
  const featureStartedAt = Date.now();
  const featureResult = await runtime.extractFeatures({
    entries: jpgEntries,
    rootName: rootDirectory.name,
    concurrency: preciseSettings.maxConcurrentJobs,
    signal,
    onProgress: ({ completed, total: featureTotal, uncachedCompleted, uncachedTotal }) => onProgress?.({
      cur: completed,
      total,
      msg: `시각 특징 추출 ${completed}/${featureTotal}${estimatedRemaining(uncachedCompleted, uncachedTotal, featureStartedAt)}`,
    }),
  });

  if (signal.aborted || isCancelled()) {
    onStateChange?.("CANCELLED");
    return {
      status: "cancelled",
      rawFiles,
      scenes: [],
      boundaryDecisions: [],
      logs: ["⏸ 정밀 분류가 중단되었습니다. 원본 파일은 이동되지 않았습니다."],
      total,
    };
  }

  onStateChange?.("DETECTING_BOUNDARIES");
  let candidates = buildVisualBoundaryCandidates(jpgEntries, featureResult.features, preciseSettings);
  const purposeScan = await runtime.appendPurposeCandidates({
    entries: jpgEntries,
    candidates,
    department,
    hardGapMinutes: preciseSettings.hardGapMinutes,
    signal,
    isCancelled,
    onProgress: (completed, segmentTotal) => onProgress?.({
      cur: completed,
      total: segmentTotal,
      msg: `촬영목적 전환 스캔 ${completed}/${segmentTotal}`,
    }),
  });
  candidates = purposeScan.candidates;
  onProgress?.({ cur: 0, total: candidates.length, msg: `경계 후보 ${candidates.length}개 분석 준비(목적 전환 포함)` });

  onStateChange?.("VERIFYING_BOUNDARIES");
  const boundaryStartedAt = Date.now();
  const boundaryDecisions = await runtime.verifyBoundaries({
    entries: jpgEntries,
    candidates,
    settings: preciseSettings,
    department,
    checkpointId: `${rootDirectory.name}:${department}:${effectiveGapMinutes}:precise-v2`,
    weights: weightProfile?.weights,
    signal,
    onProgress: ({ completed, total: boundaryTotal, restored }) => onProgress?.({
      cur: completed,
      total: boundaryTotal,
      msg: `${restored ? "경계 검증 복원" : "경계 검증"} ${completed}/${boundaryTotal}${estimatedRemaining(completed, boundaryTotal, boundaryStartedAt)}`,
    }),
  });

  onStateChange?.("CREATING_SCENES");
  const sceneFiles: SceneFile[] = jpgEntries.map((entry, index) => ({
    name: entry.name,
    basename: entry.name.replace(/\.[^.]+$/, ""),
    handle: entry.handle,
    mtime: entry.mtime,
    timestampSource: entry.timestampSource,
    thumbUrl: null,
    visualFeatures: featureResult.features[index],
  }));
  const scenes = buildFieldScenesFromBoundaries(sceneFiles, boundaryDecisions);
  await mapWithConcurrency(scenes, 3, async (scene) => {
    const thumbIndexes = Array.from(new Set([0, scene.files.length - 1]));
    await Promise.all(thumbIndexes.map(async (index) => {
      try {
        scene.files[index].thumbUrl = await runtime.loadThumbnail(await scene.files[index].handle.getFile(), 160);
      } catch (error) {
        console.error("[OLIVIA] Suppressed error", error);
      }
    }));
    return scene;
  });

  const fallbackCount = jpgEntries.filter((entry) => entry.timestampSource === "mtime").length;
  onProgress?.({ cur: total, total, msg: "하이브리드 Scene 계획 생성 완료" });
  onStateChange?.("WAITING_REVIEW");
  return {
    status: "done",
    rawFiles,
    scenes,
    boundaryDecisions,
    logs: [
      `✅ 하이브리드 분류 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${scenes.length}개`,
      `🧭 경계 후보 ${candidates.length}개 / AI 검토 필요 ${boundaryDecisions.filter((decision) => decision.needsReview).length}개`,
      `🕒 EXIF 없음·mtime 대체 ${fallbackCount}장 / 손상·특징 실패 ${featureResult.failedImages}장`,
      "🔒 승인 전 파일 이동 없음 — 씬 검토 후 폴더 정리를 실행하세요",
    ],
    total,
  };
}
