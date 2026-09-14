import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildCandidateSegments,
  buildVisualBoundaryCandidates,
  sortTimestampedFiles,
} from "@/lib/photo-classifier/candidate-builder";
import { decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { getClassificationSettings } from "@/lib/photo-classifier/classification-settings";
import {
  JPG_PHOTO_EXTENSIONS,
  PROFILE_EXCLUDED_SCENE_TYPES,
  RAW_PHOTO_EXTENSIONS,
} from "@/lib/photo-classifier/constants";
import { buildPurposeSampleIndices, findPurposeTransitions } from "@/lib/photo-classifier/purpose-scan";
import { buildSceneRangesFromBoundaries } from "@/lib/photo-classifier/scene-builder";
import { computeFolderStats, type SceneWeightProfile } from "@/lib/photo-classifier/pattern-analysis";
import type {
  LocalVisualFeatures,
  SceneBoundaryDecision,
  SceneFrameAnalysis,
} from "@/lib/photo-classifier/hybrid-types";
import {
  analyzeNodeJpgQuality,
  createNodeApiImage,
  extractNodeVisualFeatures,
  readNodePhotoTimestamp,
} from "./imageAdapter";
import {
  assertSafeWorkMutation,
  prepareRemotePhotoWorkFolder,
} from "./pathSafety";
import { getStorageRoots } from "./storageConfig";
import type {
  NodePhotoEntry,
  NodePhotoScene,
  RemotePhotoSortRunnerInput,
  RemotePhotoSortSuccess,
  RunnerProgress,
  RunnerRoots,
} from "./types";
import { analyzeFolderPattern } from "@/lib/photo-classifier/server/folderPatternAi";
import {
  analyzePhotoScene,
  analyzeProfilePhoto,
  analyzeSceneBoundary,
  scanScenePurposes,
} from "@/lib/photo-classifier/server/sceneAi";

type Operation = {
  type: "copy_remove";
  category: "RAW" | "JPG" | "QUALITY" | "PROFILE";
  source: string;
  destination: string;
  status: "completed" | "failed";
  error?: string;
  at: string;
};

type RunnerWarning = {
  stage: string;
  message: string;
  fileName?: string;
};

type AiAdapter = {
  folderPattern: typeof analyzeFolderPattern;
  purposeScan: typeof scanScenePurposes;
  boundary: typeof analyzeSceneBoundary;
  scene: typeof analyzePhotoScene;
  profile: typeof analyzeProfilePhoto;
};

export type RemotePhotoSortRunnerDependencies = {
  roots?: RunnerRoots;
  ai?: Partial<AiAdapter>;
  onProgress?: (progress: RunnerProgress) => void;
  /** PHASE 5: SSD2에는 RAW를 건드리지 않고 JPG만 분류한다. */
  preserveRaw?: boolean;
};

const defaultAi: AiAdapter = {
  folderPattern: analyzeFolderPattern,
  purposeScan: scanScenePurposes,
  boundary: analyzeSceneBoundary,
  scene: analyzePhotoScene,
  profile: analyzeProfilePhoto,
};

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function safeSceneFolderName(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(/[/:\\\0]/g, "_")
    .replace(/^\.+$/, "")
    .trim();
  return normalized || fallback;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const consume = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, consume),
  );
  return results;
}

async function scanWorkFolder(
  workFolder: string,
  fastAnalyzeMode: boolean,
  onProgress?: (progress: RunnerProgress) => void,
): Promise<{ raw: NodePhotoEntry[]; jpg: NodePhotoEntry[] }> {
  const directoryEntries = await readdir(workFolder, { withFileTypes: true });
  const raw: NodePhotoEntry[] = [];
  const jpg: NodePhotoEntry[] = [];
  let scanned = 0;

  for (const entry of directoryEntries) {
    if (!entry.isFile()) continue;
    const fileExtension = extension(entry.name);
    if (!RAW_PHOTO_EXTENSIONS.has(fileExtension) && !JPG_PHOTO_EXTENSIONS.has(fileExtension)) continue;
    const filePath = path.join(workFolder, entry.name);
    const metadata = await stat(filePath);
    scanned += 1;
    onProgress?.({
      stage: "SCANNING",
      current: scanned,
      total: directoryEntries.length,
      message: `파일 확인: ${entry.name}`,
    });

    if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) {
      raw.push({
        name: entry.name,
        path: filePath,
        size: metadata.size,
        mtime: metadata.mtimeMs,
        timestampSource: "mtime",
      });
      continue;
    }

    if (fastAnalyzeMode) {
      jpg.push({
        name: entry.name,
        path: filePath,
        size: metadata.size,
        mtime: metadata.mtimeMs,
        timestampSource: "mtime",
      });
    } else {
      const timestamp = await readNodePhotoTimestamp(filePath);
      jpg.push({
        name: entry.name,
        path: filePath,
        size: metadata.size,
        mtime: timestamp.timestamp,
        timestampSource: timestamp.source,
        warning: timestamp.warning,
      });
    }
  }

  return { raw, jpg: sortTimestampedFiles(jpg) };
}

function buildFastScenes(entries: NodePhotoEntry[], gapMinutes: number): NodePhotoScene[] {
  if (!entries.length) return [];
  const groups: NodePhotoEntry[][] = [[entries[0]]];
  const gapMs = gapMinutes * 60_000;
  for (let index = 1; index < entries.length; index++) {
    if (entries[index].mtime - entries[index - 1].mtime > gapMs) groups.push([entries[index]]);
    else groups[groups.length - 1].push(entries[index]);
  }
  return groups.map((files, index) => {
    const folderName = `Scene${String(index + 1).padStart(2, "0")}`;
    return {
      index: index + 1,
      folderName,
      editedName: folderName,
      startTime: files[0].mtime,
      endTime: files[files.length - 1].mtime,
      files,
      sceneType: null,
      aiConfidence: null,
      aiReason: null,
    };
  });
}

function representativeIndexes(length: number): number[] {
  if (length <= 0) return [];
  return Array.from(new Set([
    0,
    Math.min(1, length - 1),
    Math.floor(length / 2),
    Math.min(Math.floor(length / 2) + 1, length - 1),
    Math.max(0, length - 2),
    length - 1,
  ])).slice(0, 6);
}

async function enrichFastScenes(
  scenes: NodePhotoScene[],
  input: RemotePhotoSortRunnerInput,
  ai: AiAdapter,
  warnings: RunnerWarning[],
  onProgress?: (progress: RunnerProgress) => void,
): Promise<void> {
  if (!input.aiNamingEnabled && !input.departmentLogicEnabled) return;
  if (!process.env.OPENAI_API_KEY) {
    warnings.push({ stage: "SCENE_ANALYSIS", message: "OPENAI_API_KEY가 없어 Scene AI 분석을 건너뛰었습니다." });
    return;
  }

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    onProgress?.({
      stage: "ANALYZING",
      current: index + 1,
      total: scenes.length,
      message: `Scene 분석: ${scene.folderName}`,
    });
    try {
      const images = await Promise.all(representativeIndexes(scene.files.length).map(async (fileIndex) => ({
        fileName: scene.files[fileIndex].name,
        base64: await createNodeApiImage(scene.files[fileIndex].path),
      })));
      const result = await ai.scene({
        department: input.department,
        sceneId: scene.folderName,
        images,
        useHighModel: false,
      });
      scene.sceneType = result.sceneType as NodePhotoScene["sceneType"];
      scene.aiConfidence = result.confidence;
      scene.aiReason = result.reason;
      scene.patientPosture = result.patientPosture;
      scene.hasHandpiece = result.hasHandpiece;
      scene.hasTreatmentDevice = result.hasTreatmentDevice;
      scene.hasTreatmentBed = result.hasTreatmentBed;
      scene.hasConsultationDesk = result.hasConsultationDesk;
      if (input.aiNamingEnabled && result.suggestedFolderName) {
        const suggested = `Scene${String(scene.index).padStart(2, "0")}_${result.suggestedFolderName}`;
        scene.editedName = safeSceneFolderName(suggested, scene.folderName);
      }
    } catch (error) {
      warnings.push({
        stage: "SCENE_ANALYSIS",
        message: error instanceof Error ? error.message : String(error),
        fileName: scene.files[0]?.name,
      });
    }
  }
}

async function classifyPrecise(
  entries: NodePhotoEntry[],
  input: RemotePhotoSortRunnerInput,
  ai: AiAdapter,
  warnings: RunnerWarning[],
  onProgress?: (progress: RunnerProgress) => void,
): Promise<{ scenes: NodePhotoScene[]; decisions: SceneBoundaryDecision[] }> {
  const featureResults = await mapWithConcurrency(entries, 3, async (entry, index) => {
    onProgress?.({
      stage: "ANALYZING",
      current: index + 1,
      total: entries.length,
      message: `시각 특징 추출: ${entry.name}`,
    });
    try {
      return await extractNodeVisualFeatures(entry.path);
    } catch (error) {
      warnings.push({
        stage: "FEATURE_EXTRACTION",
        fileName: entry.name,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  const firstValid = featureResults.find((feature): feature is LocalVisualFeatures => feature !== null);
  if (!firstValid) throw new Error("JPG 시각 특징을 한 장도 추출하지 못했습니다.");
  const safeFeatures = featureResults.map((feature, index) => (
    feature ?? featureResults[index - 1] ?? firstValid
  )) as LocalVisualFeatures[];
  entries.forEach((entry, index) => { entry.visualFeatures = safeFeatures[index]; });

  let weightProfile: SceneWeightProfile | null = null;
  if (input.classificationUiMode === "ai-auto" && process.env.OPENAI_API_KEY) {
    try {
      const pattern = await ai.folderPattern({
        department: input.department,
        stats: computeFolderStats(entries.map((entry) => entry.mtime), [], 1),
      });
      weightProfile = pattern.profile;
    } catch (error) {
      warnings.push({
        stage: "FOLDER_PATTERN",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const effectiveGapMinutes = weightProfile?.absoluteTimeGapMinutes ?? input.gapMinutes;
  const settings = {
    ...getClassificationSettings(input.department === "dermatology" ? "dermatology" : "default", "precise"),
    hardGapMinutes: effectiveGapMinutes,
    ...(weightProfile ? {
      splitThreshold: weightProfile.splitThreshold,
      reviewThreshold: weightProfile.reviewThreshold,
    } : {}),
  };
  const candidates = buildVisualBoundaryCandidates(entries, safeFeatures, settings);
  const existingBoundaryIndexes = new Set(candidates.map((candidate) => candidate.boundaryIndex));

  if (process.env.OPENAI_API_KEY) {
    const purposeSegments = buildCandidateSegments(entries, settings.hardGapMinutes);
    for (let segmentIndex = 0; segmentIndex < purposeSegments.length; segmentIndex++) {
      const segment = purposeSegments[segmentIndex];
      const segmentLength = segment.endIndex - segment.startIndex + 1;
      if (segmentLength < 8) continue;
      onProgress?.({
        stage: "ANALYZING",
        current: segmentIndex + 1,
        total: purposeSegments.length,
        message: "촬영목적 전환 분석 중",
      });
      try {
        const images = await Promise.all(buildPurposeSampleIndices(segmentLength).map(async (localIndex) => {
          const entry = entries[segment.startIndex + localIndex];
          return {
            fileName: entry.name,
            index: localIndex,
            base64: await createNodeApiImage(entry.path),
          };
        }));
        const labels = await ai.purposeScan({ department: input.department, images });
        for (const localTransition of findPurposeTransitions(labels)) {
          const boundaryIndex = segment.startIndex + localTransition;
          if (boundaryIndex <= 0 || boundaryIndex >= entries.length || existingBoundaryIndexes.has(boundaryIndex)) continue;
          existingBoundaryIndexes.add(boundaryIndex);
          candidates.push({
            boundaryIndex,
            timeGapMs: Math.max(0, entries[boundaryIndex].mtime - entries[boundaryIndex - 1].mtime),
            visualChangeScore: 0,
            hardGap: false,
            requiresAi: true,
          });
        }
      } catch (error) {
        warnings.push({
          stage: "PURPOSE_SCAN",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else {
    warnings.push({ stage: "AI_BOUNDARY", message: "OPENAI_API_KEY가 없어 AI 경계 분석은 로컬 특징으로 대체했습니다." });
  }

  candidates.sort((left, right) => left.boundaryIndex - right.boundaryIndex);
  const decisions = await mapWithConcurrency(candidates, settings.maxConcurrentAiJobs, async (candidate, index) => {
    onProgress?.({
      stage: "ANALYZING",
      current: index + 1,
      total: candidates.length,
      message: `Scene 경계 검증 ${index + 1}/${candidates.length}`,
    });
    const beforeFileName = entries[candidate.boundaryIndex - 1]?.name ?? "";
    const afterFileName = entries[candidate.boundaryIndex]?.name ?? "";
    if (candidate.hardGap) {
      return decideBoundary({
        candidate,
        analysis: null,
        settings,
        beforeFileName,
        afterFileName,
        weights: weightProfile?.weights,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return decideBoundary({
        candidate,
        analysis: null,
        aiFailed: true,
        settings,
        beforeFileName,
        afterFileName,
        weights: weightProfile?.weights,
      });
    }

    const analyze = async (windowSize: number, useHighModel: boolean): Promise<SceneFrameAnalysis> => {
      const beforeEntries = entries.slice(Math.max(0, candidate.boundaryIndex - windowSize), candidate.boundaryIndex);
      const afterEntries = entries.slice(candidate.boundaryIndex, Math.min(entries.length, candidate.boundaryIndex + windowSize));
      const [before, after] = await Promise.all([
        Promise.all(beforeEntries.map(async (entry) => ({
          fileName: entry.name,
          base64: await createNodeApiImage(entry.path, { maxSize: 1080, quality: 0.82 }),
        }))),
        Promise.all(afterEntries.map(async (entry) => ({
          fileName: entry.name,
          base64: await createNodeApiImage(entry.path, { maxSize: 1080, quality: 0.82 }),
        }))),
      ]);
      return ai.boundary({ department: input.department, before, after, useHighModel });
    };

    try {
      let analysis = await analyze(3, false);
      let decision = decideBoundary({
        candidate,
        analysis,
        settings,
        beforeFileName,
        afterFileName,
        weights: weightProfile?.weights,
      });
      if (decision.decision === "review") {
        analysis = await analyze(5, true);
        decision = decideBoundary({
          candidate,
          analysis,
          settings,
          beforeFileName,
          afterFileName,
          weights: weightProfile?.weights,
        });
      }
      return decision;
    } catch (error) {
      warnings.push({
        stage: "BOUNDARY_ANALYSIS",
        fileName: afterFileName,
        message: error instanceof Error ? error.message : String(error),
      });
      return decideBoundary({
        candidate,
        analysis: null,
        aiFailed: true,
        settings,
        beforeFileName,
        afterFileName,
        weights: weightProfile?.weights,
      });
    }
  });

  const stabilized = stabilizeBoundaries(decisions, entries.length, settings.minimumSceneImages);
  const scenes = buildSceneRangesFromBoundaries(entries.length, stabilized).map((range): NodePhotoScene => ({
    index: range.index,
    folderName: range.folderName,
    editedName: range.folderName,
    startTime: entries[range.startIndex].mtime,
    endTime: entries[range.endIndex - 1].mtime,
    files: entries.slice(range.startIndex, range.endIndex),
    sceneType: null,
    aiConfidence: range.aiConfidence,
    aiReason: range.boundaryBefore?.reasons.join(" · ") ?? null,
    boundaryBefore: range.boundaryBefore,
  }));
  return { scenes, decisions: stabilized };
}

async function writeAtomicJson(
  target: string,
  value: unknown,
  roots: RunnerRoots,
): Promise<void> {
  await assertSafeWorkMutation(target, roots);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  await assertSafeWorkMutation(temporary, roots);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, target);
}

async function writeCsv(target: string, headers: string[], rows: string[][], roots: RunnerRoots): Promise<void> {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const content = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  await assertSafeWorkMutation(target, roots);
  await writeFile(target, `\uFEFF${content}\n`, { flag: "wx" });
}

async function moveInsideWorkCopy(input: {
  source: string;
  destination: string;
  roots: RunnerRoots;
}): Promise<void> {
  await assertSafeWorkMutation(input.source, input.roots);
  await assertSafeWorkMutation(input.destination, input.roots);
  await copyFile(input.source, input.destination, fsConstants.COPYFILE_EXCL);
  const [sourceMetadata, destinationMetadata] = await Promise.all([
    stat(input.source),
    stat(input.destination),
  ]);
  if (sourceMetadata.size !== destinationMetadata.size) {
    throw new Error(`${path.basename(input.source)} 복사 검증에 실패했습니다.`);
  }
  await unlink(input.source);
}

async function organizeWorkCopy(input: {
  workFolder: string;
  raw: NodePhotoEntry[];
  scenes: NodePhotoScene[];
  decisions: SceneBoundaryDecision[];
  options: RemotePhotoSortRunnerInput;
  warnings: RunnerWarning[];
  roots: RunnerRoots;
  ai: AiAdapter;
  onProgress?: (progress: RunnerProgress) => void;
  preserveRaw?: boolean;
}): Promise<void> {
  const rawDirectory = path.join(input.workFolder, "RAW");
  const jpgDirectory = path.join(input.workFolder, "JPG");
  const selectDirectory = path.join(input.workFolder, "SELECT", "JPG_SELECT");
  const reportDirectory = path.join(input.workFolder, "REPORT");
  const outputDirectories = input.preserveRaw
    ? [jpgDirectory, path.dirname(selectDirectory), selectDirectory, reportDirectory]
    : [rawDirectory, jpgDirectory, path.dirname(selectDirectory), selectDirectory, reportDirectory];
  for (const directory of outputDirectories) {
    await assertSafeWorkMutation(directory, input.roots);
    await mkdir(directory, { recursive: false });
  }

  const journalPath = path.join(reportDirectory, "file_operation_journal.json");
  const operations: Operation[] = [];
  const flushJournal = async () => writeAtomicJson(journalPath, {
    version: 1,
    root: path.basename(input.workFolder),
    operations,
    updatedAt: new Date().toISOString(),
  }, input.roots);

  let completed = 0;
  const total = (input.preserveRaw ? 0 : input.raw.length) + input.scenes.reduce((sum, scene) => sum + scene.files.length, 0);
  if (!input.preserveRaw) {
    for (const entry of input.raw) {
    const destination = path.join(rawDirectory, entry.name);
    try {
      await moveInsideWorkCopy({ source: entry.path, destination, roots: input.roots });
      entry.path = destination;
      operations.push({
        type: "copy_remove",
        category: "RAW",
        source: entry.name,
        destination: `RAW/${entry.name}`,
        status: "completed",
        at: new Date().toISOString(),
      });
    } catch (error) {
      operations.push({
        type: "copy_remove",
        category: "RAW",
        source: entry.name,
        destination: `RAW/${entry.name}`,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      });
      await flushJournal();
      throw error;
    }
    completed += 1;
    input.onProgress?.({ stage: "ORGANIZING", current: completed, total, message: `RAW 정리: ${entry.name}` });
    await flushJournal();
    }
  }

  for (const scene of input.scenes) {
    const folderName = safeSceneFolderName(scene.editedName, scene.folderName);
    scene.editedName = folderName;
    const sceneDirectory = path.join(jpgDirectory, folderName);
    await assertSafeWorkMutation(sceneDirectory, input.roots);
    await mkdir(sceneDirectory, { recursive: false });
    for (const entry of scene.files) {
      const destination = path.join(sceneDirectory, entry.name);
      try {
        await moveInsideWorkCopy({ source: entry.path, destination, roots: input.roots });
        entry.path = destination;
        operations.push({
          type: "copy_remove",
          category: "JPG",
          source: entry.name,
          destination: `JPG/${folderName}/${entry.name}`,
          status: "completed",
          at: new Date().toISOString(),
        });
      } catch (error) {
        operations.push({
          type: "copy_remove",
          category: "JPG",
          source: entry.name,
          destination: `JPG/${folderName}/${entry.name}`,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        });
        await flushJournal();
        throw error;
      }
      completed += 1;
      input.onProgress?.({ stage: "ORGANIZING", current: completed, total, message: `${folderName}: ${entry.name}` });
      await flushJournal();
    }
  }

  const qualityRows: string[][] = [];
  const profileRows: string[][] = [];
  let qualityCount = 0;
  let profileCount = 0;

  for (const scene of input.scenes) {
    const skipProfile = PROFILE_EXCLUDED_SCENE_TYPES.has(scene.sceneType ?? "");
    for (const entry of scene.files) {
      let movedByQuality = false;
      if (input.options.qualityAnalysisEnabled) {
        try {
          const quality = await analyzeNodeJpgQuality(entry.path);
          const reason = quality.blurScore < 18
            ? "흔들림"
            : quality.brightness < 38
              ? "조명불량"
              : quality.brightness > 230 ? "확인필요" : "";
          if (reason) {
            const directory = path.join(jpgDirectory, "00_QUALITY_EXCLUDED", reason);
            await assertSafeWorkMutation(directory, input.roots);
            await mkdir(directory, { recursive: true });
            const destination = path.join(directory, entry.name);
            await moveInsideWorkCopy({ source: entry.path, destination, roots: input.roots });
            operations.push({
              type: "copy_remove",
              category: "QUALITY",
              source: path.relative(input.workFolder, entry.path),
              destination: path.relative(input.workFolder, destination),
              status: "completed",
              at: new Date().toISOString(),
            });
            entry.path = destination;
            qualityRows.push([entry.name, scene.editedName, reason, ""]);
            qualityCount += 1;
            movedByQuality = true;
            await flushJournal();
          }
        } catch (error) {
          input.warnings.push({
            stage: "QUALITY_ANALYSIS",
            fileName: entry.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!input.options.profileClassificationEnabled || movedByQuality) continue;
      if (skipProfile) {
        profileRows.push([
          entry.name, scene.editedName, "0.00", "false", "", "", "", "", "",
          "", "", "", "", "", "", "", `${scene.sceneType} 장면이므로 프로필 제외`, "",
        ]);
        continue;
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        input.warnings.push({
          stage: "PROFILE_ANALYSIS",
          fileName: entry.name,
          message: "ANTHROPIC_API_KEY가 없어 프로필 판정을 건너뛰었습니다.",
        });
        continue;
      }
      try {
        const result = await input.ai.profile(await createNodeApiImage(entry.path));
        let movedTo = "";
        if (result.isProfile) {
          const profileDirectory = path.join(input.workFolder, "PROFILE");
          await assertSafeWorkMutation(profileDirectory, input.roots);
          await mkdir(profileDirectory, { recursive: true });
          const destination = path.join(profileDirectory, entry.name);
          await moveInsideWorkCopy({ source: entry.path, destination, roots: input.roots });
          operations.push({
            type: "copy_remove",
            category: "PROFILE",
            source: path.relative(input.workFolder, entry.path),
            destination: path.relative(input.workFolder, destination),
            status: "completed",
            at: new Date().toISOString(),
          });
          entry.path = destination;
          profileCount += 1;
          movedTo = "PROFILE/";
          await flushJournal();
        }
        const rejection = result.isProfile
          ? "프로필 조건 충족"
          : result.personCount !== 1
            ? `인원수 불일치(${result.personCount}명) — 1인이 아님`
            : `정면 응시·의도된 포즈 아님 (facingForward:${result.facingForward}, intentionalPose:${result.intentionalPose})`;
        profileRows.push([
          entry.name,
          scene.editedName,
          result.confidence.toFixed(2),
          result.isProfile ? "true" : "false",
          String(result.personCount),
          result.hasPatient ? "true" : "false",
          result.facingForward ? "true" : "false",
          result.intentionalPose ? "true" : "false",
          "", "", "", "", "", "", "", "",
          rejection,
          movedTo,
        ]);
      } catch (error) {
        input.warnings.push({
          stage: "PROFILE_ANALYSIS",
          fileName: entry.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (qualityRows.length) {
    await writeCsv(
      path.join(reportDirectory, "quality_report.csv"),
      ["file_name", "scene", "reason", "note"],
      qualityRows,
      input.roots,
    );
  }
  if (profileRows.length) {
    await writeCsv(
      path.join(reportDirectory, "profile_report.csv"),
      [
        "file_name", "original_scene", "profile_confidence", "is_profile",
        "main_person_count", "has_patient", "is_looking_at_camera", "has_intentional_pose",
        "has_tool", "has_medical_device", "has_handpiece", "has_syringe",
        "has_consultation_object", "is_consultation", "is_treatment", "is_procedure",
        "reason", "moved_to",
      ],
      profileRows,
      input.roots,
    );
  }

  await Promise.all([
    flushJournal(),
    writeAtomicJson(path.join(reportDirectory, "scene_boundaries.json"), {
      version: 1,
      boundaries: input.decisions,
      createdAt: new Date().toISOString(),
    }, input.roots),
    writeAtomicJson(path.join(reportDirectory, "scene_report.json"), {
      version: 1,
      scenes: input.scenes.map((scene) => ({
        index: scene.index,
        folderName: scene.editedName,
        startTime: new Date(scene.startTime).toISOString(),
        endTime: new Date(scene.endTime).toISOString(),
        fileCount: scene.files.length,
        sceneType: scene.sceneType,
        aiConfidence: scene.aiConfidence,
        aiReason: scene.aiReason,
        files: scene.files.map((entry) => entry.name),
      })),
      createdAt: new Date().toISOString(),
    }, input.roots),
    writeAtomicJson(path.join(reportDirectory, "summary.json"), {
      mode: "field",
      classificationMode: input.options.fastAnalyzeMode ? "fast" : "precise",
      automaticHeadlessApproval: true,
      reviewRequiredBeforeMove: false,
      department: input.options.department,
      gapMinutes: input.options.gapMinutes,
      classificationUiMode: input.options.classificationUiMode,
      departmentLogicEnabled: input.options.departmentLogicEnabled,
      aiNamingEnabled: input.options.aiNamingEnabled,
      qualityAnalysisEnabled: input.options.qualityAnalysisEnabled,
      profileClassificationEnabled: input.options.profileClassificationEnabled,
      totalJpg: input.scenes.reduce((sum, scene) => sum + scene.files.length, 0),
      totalRaw: input.raw.length,
      totalScenes: input.scenes.length,
      totalProfile: profileCount,
      totalQualityReject: qualityCount,
      reviewBoundaryCount: input.decisions.filter((decision) => decision.needsReview).length,
      warnings: input.warnings,
      createdAt: new Date().toISOString(),
    }, input.roots),
  ]);
}

async function countPhotosRecursively(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await countPhotosRecursively(entryPath);
    else if (entry.isFile() && (
      JPG_PHOTO_EXTENSIONS.has(extension(entry.name)) || RAW_PHOTO_EXTENSIONS.has(extension(entry.name))
    )) total += 1;
  }
  return total;
}

export async function runRemotePhotoSortRunner(
  input: RemotePhotoSortRunnerInput,
  dependencies: RemotePhotoSortRunnerDependencies = {},
): Promise<RemotePhotoSortSuccess> {
  const startedAt = Date.now();
  if (input.shootingMode !== "field") {
    throw new Error("현재 Headless Runner는 shooting_mode=field만 지원합니다.");
  }
  if (!Number.isFinite(input.gapMinutes) || input.gapMinutes <= 0) {
    throw new Error("gap_minutes는 0보다 큰 숫자여야 합니다.");
  }

  const roots = dependencies.roots ?? getStorageRoots();
  const ai: AiAdapter = { ...defaultAi, ...dependencies.ai };
  const prepared = await prepareRemotePhotoWorkFolder({
    sourceFolder: "sourceFolder" in input ? input.sourceFolder : undefined,
    workFolder: "workFolder" in input ? input.workFolder : undefined,
  }, roots, dependencies.onProgress);
  const warnings: RunnerWarning[] = [];

  const scanned = await scanWorkFolder(prepared.workFolder, input.fastAnalyzeMode, dependencies.onProgress);
  if (!scanned.jpg.length) throw new Error("분류할 JPG/JPEG 파일이 없습니다.");
  scanned.jpg.forEach((entry) => {
    if (entry.warning) warnings.push({ stage: "TIMESTAMP", fileName: entry.name, message: entry.warning });
  });

  let scenes: NodePhotoScene[];
  let decisions: SceneBoundaryDecision[];
  if (input.fastAnalyzeMode) {
    scenes = buildFastScenes(scanned.jpg, input.gapMinutes);
    decisions = [];
    await enrichFastScenes(scenes, input, ai, warnings, dependencies.onProgress);
  } else {
    const precise = await classifyPrecise(scanned.jpg, input, ai, warnings, dependencies.onProgress);
    scenes = precise.scenes;
    decisions = precise.decisions;
  }
  if (!scenes.length) throw new Error("Scene 계획을 생성하지 못했습니다.");

  await organizeWorkCopy({
    workFolder: prepared.workFolder,
    raw: scanned.raw,
    scenes,
    decisions,
    options: input,
    warnings,
    roots,
    ai,
    onProgress: dependencies.onProgress,
    preserveRaw: dependencies.preserveRaw,
  });

  dependencies.onProgress?.({ stage: "VERIFYING", message: "분류 결과의 파일 수를 검증하고 있습니다." });
  const expectedPhotoCount = scanned.raw.length + scanned.jpg.length;
  const actualPhotoCount = await countPhotosRecursively(prepared.workFolder);
  if (expectedPhotoCount !== actualPhotoCount) {
    throw new Error(`최종 파일 수 검증에 실패했습니다 (${expectedPhotoCount} → ${actualPhotoCount}).`);
  }

  return {
    ok: true,
    status: "COMPLETED",
    sourceFolder: prepared.sourceFolder,
    workFolder: prepared.workFolder,
    fileCount: expectedPhotoCount,
    rawCount: scanned.raw.length,
    jpgCount: scanned.jpg.length,
    sceneCount: scenes.length,
    reviewBoundaryCount: decisions.filter((decision) => decision.needsReview).length,
    durationMs: Date.now() - startedAt,
  };
}
