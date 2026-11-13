import { PROFILE_EXCLUDED_SCENE_TYPES } from "./constants";
import { analyzeJpg, getApiThumb } from "./browserProcessing";
import { copyFileHandle, withTimeout } from "./browserFileOps";
import {
  buildFieldSecondaryReportFiles,
  describePortraitAssessment,
  normalizePortraitAssessment,
  resolveQualityRejectReason,
  type FieldSecondaryReportFile,
  type PortraitAssessment,
} from "./fieldSecondaryReports";
import type { MergeDecision, SceneMergeCandidate } from "./scene-merge-types";
import type { FieldScene, MedicalDepartment } from "./types";

type SecondaryReportContext = {
  fastAnalyzeMode: boolean;
  department: MedicalDepartment;
  departmentDisplayName: string;
  gapMinutes: number;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
};

type SecondaryAnalysisError = {
  stage: "photo" | "report";
  fileName?: string;
  message: string;
};

async function analyzePortrait(file: File): Promise<PortraitAssessment> {
  const data = await withTimeout((async () => {
    const thumbnail = await getApiThumb(file);
    const response = await fetch("/api/portrait-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnail }),
    });
    return response.json();
  })(), 45_000, "프로필 판정");
  return normalizePortraitAssessment(data);
}

async function writeReports(
  rootDir: FileSystemDirectoryHandle,
  reports: readonly FieldSecondaryReportFile[],
): Promise<void> {
  const reportDir = await rootDir.getDirectoryHandle("REPORT", { create: true });
  for (const report of reports) {
    const fileHandle = await reportDir.getFileHandle(report.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(`﻿${report.content}`);
    await writable.close();
  }
}

export async function runFieldSecondaryAnalysis({
  scenes,
  rootDir,
  fieldJpgBaseDir,
  fieldRawCount,
  qualityAnalysisEnabled,
  profileClassificationEnabled,
  mergeCandidates,
  mergeDecisions,
  reportContext,
  isCancelled,
  onProgress,
  onScenesUpdated,
  qualityAnalyzer = analyzeJpg,
  portraitAnalyzer = analyzePortrait,
  copyFile = copyFileHandle,
  reportWriter = writeReports,
}: {
  scenes: readonly FieldScene[];
  rootDir: FileSystemDirectoryHandle;
  fieldJpgBaseDir: FileSystemDirectoryHandle | null;
  fieldRawCount: number;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  mergeCandidates: SceneMergeCandidate[];
  mergeDecisions: MergeDecision[];
  reportContext: SecondaryReportContext;
  isCancelled: () => boolean;
  onProgress?: (progress: { current: number; total: number; fileName: string }) => void;
  onScenesUpdated?: (scenes: FieldScene[]) => void;
  qualityAnalyzer?: (file: File) => Promise<{ blurScore: number; brightness: number }>;
  portraitAnalyzer?: (file: File) => Promise<PortraitAssessment>;
  copyFile?: typeof copyFileHandle;
  reportWriter?: (rootDir: FileSystemDirectoryHandle, reports: readonly FieldSecondaryReportFile[]) => Promise<void>;
}): Promise<{
  scenes: FieldScene[];
  total: number;
  profileTotal: number;
  qualityRejectTotal: number;
  errors: SecondaryAnalysisError[];
}> {
  const total = scenes.reduce((sum, scene) => sum + scene.fileCount, 0);
  let completed = 0;
  let qualityRejectTotal = 0;
  let profileTotal = 0;
  const qualityRows: string[][] = [];
  const profileRows: string[][] = [];
  const errors: SecondaryAnalysisError[] = [];
  let qualityExcludedDir: FileSystemDirectoryHandle | null = null;
  let profileDir: FileSystemDirectoryHandle | null = null;
  const updated = scenes.map((scene) => ({ ...scene }));
  let lastUpdate = Date.now();

  for (let sceneIndex = 0; sceneIndex < updated.length; sceneIndex += 1) {
    if (isCancelled()) break;
    const scene = updated[sceneIndex];
    const sceneType = scene.sceneType ?? "";
    const skipProfile = PROFILE_EXCLUDED_SCENE_TYPES.has(sceneType);

    for (const photo of scene.files) {
      if (isCancelled()) break;
      if (completed % 20 === 0 || Date.now() - lastUpdate > 300) {
        onProgress?.({ current: completed, total, fileName: photo.name });
        lastUpdate = Date.now();
      }

      try {
        const file = await photo.handle.getFile();
        if (qualityAnalysisEnabled) {
          const { blurScore, brightness } = await qualityAnalyzer(file);
          const rejectReason = resolveQualityRejectReason(blurScore, brightness);
          if (rejectReason && scene.sceneDir && fieldJpgBaseDir) {
            qualityExcludedDir ??= await fieldJpgBaseDir.getDirectoryHandle("00_QUALITY_EXCLUDED", { create: true });
            const reasonDir = await qualityExcludedDir.getDirectoryHandle(rejectReason, { create: true });
            await copyFile(photo.handle, reasonDir, photo.name);
            try {
              await scene.sceneDir.removeEntry(photo.name);
            } catch (error) {
              console.error("[OLIVIA] Suppressed error", error);
            }
            qualityRows.push([photo.name, scene.editedName, rejectReason, ""]);
            qualityRejectTotal += 1;
            scene.qualityRejectCount += 1;
          }
        }

        if (profileClassificationEnabled && !skipProfile) {
          let assessment = normalizePortraitAssessment(null);
          try {
            assessment = await portraitAnalyzer(file);
          } catch (error) {
            console.error("[OLIVIA] Suppressed error", error);
          }
          let movedTo = "";
          if (assessment.isProfileCandidate && scene.sceneDir) {
            profileDir ??= await rootDir.getDirectoryHandle("PROFILE", { create: true });
            await copyFile(photo.handle, profileDir, photo.name);
            try {
              await scene.sceneDir.removeEntry(photo.name);
            } catch (error) {
              console.error("[OLIVIA] Suppressed error", error);
            }
            movedTo = "PROFILE/";
            profileTotal += 1;
            scene.profileCount += 1;
          }
          profileRows.push([
            photo.name,
            scene.editedName,
            assessment.confidence.toFixed(2),
            assessment.isProfileCandidate ? "true" : "false",
            String(assessment.personCount), "",
            assessment.facingForward ? "true" : "false",
            assessment.intentionalPose ? "true" : "false",
            "", "", "", "", "", "", "", "",
            describePortraitAssessment(assessment),
            movedTo,
          ]);
        } else if (profileClassificationEnabled && skipProfile) {
          profileRows.push([
            photo.name, scene.editedName, "0.00", "false",
            "", "", "", "", "", "", "", "", "", "", "", "",
            `${sceneType} 장면이므로 프로필 제외`,
            "",
          ]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: "photo", fileName: photo.name, message });
        console.error("[OLIVIA] Suppressed error", error);
      }
      completed += 1;
    }
    onScenesUpdated?.([...updated]);
  }

  const reports = buildFieldSecondaryReportFiles({
    qualityRows,
    profileRows,
    mergeCandidates,
    mergeDecisions,
    summary: {
      ...reportContext,
      totalJpg: total,
      totalRaw: fieldRawCount,
      totalInitialScenes: updated.length,
      totalFinalScenes: updated.length,
      totalProfile: profileTotal,
      totalQualityReject: qualityRejectTotal,
    },
  });
  try {
    await reportWriter(rootDir, reports);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ stage: "report", message });
    console.error("[OLIVIA] Suppressed error", error);
  }

  return { scenes: updated, total, profileTotal, qualityRejectTotal, errors };
}
