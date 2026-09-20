import { lstat, readdir, realpath, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import { runRemotePhotoSortRunner, type RemotePhotoSortRunnerDependencies } from "./remotePhotoSortRunner";
import { resolveSafeWorkRoot } from "./pathSafety";
import { getStorageRoots } from "./storageConfig";
import { JPG_INTEGRATED_DIRECTORY, SCENE_CLASSIFIED_DIRECTORY } from "./storageLayout";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { RemotePhotoSortRunnerOptions, RunnerProgress, RunnerRoots } from "./types";

export const PHOTO_CLASSIFY_DEFAULT_OPTIONS: RemotePhotoSortRunnerOptions = {
  shootingMode: "field",
  department: "dermatology",
  gapMinutes: 3.5,
  classificationUiMode: "ai-auto",
  fastAnalyzeMode: false,
  departmentLogicEnabled: true,
  aiNamingEnabled: false,
  qualityAnalysisEnabled: false,
  profileClassificationEnabled: false,
};

export type PhotoClassifyWorkInput = RemotePhotoSortRunnerOptions & {
  workRelativePath: string;
  roots?: RunnerRoots;
  expectedJpgCount?: number;
  expectedJpgBytes?: number;
};

export type PhotoClassifyWorkSuccess = {
  ok: true;
  status: "CLASSIFY_COMPLETED";
  projectPath: string;
  workRelativePath: string;
  jpgCount: number;
  sceneCount: number;
  durationMs: number;
};

export type PhotoClassifyWorkFailure = {
  ok: false;
  status: "CLASSIFY_FAILED" | "REVIEW_REQUIRED";
  workRelativePath: string;
  jpgCount: number;
  error: string;
};

export type PhotoClassifyWorkResult = PhotoClassifyWorkSuccess | PhotoClassifyWorkFailure;

type PhotoSnapshot = { name: string; size: number };

const DEFAULT_MIN_FREE_BYTES = 30 * 1024 ** 3;
const MIN_SAFETY_MARGIN_BYTES = 1024 ** 3;

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function validateRelativePath(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.includes("\\") || path.isAbsolute(value)) {
    throw new Error("work_relative_path는 SSD2 기준 상대경로여야 합니다.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("work_relative_path에 허용되지 않는 경로가 있습니다.");
  }
  return value;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolveProjectFolder(relativePath: string, roots: RunnerRoots): Promise<{ root: string; projectFolder: string }> {
  const root = await resolveSafeWorkRoot(roots);
  const candidate = path.resolve(root, ...relativePath.split("/"));
  if (!isInside(root, candidate)) throw new Error("분류 작업 폴더가 WORK_ROOT 밖입니다.");
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("분류 작업 폴더가 안전한 폴더가 아닙니다.");
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error("분류 작업 폴더가 WORK_ROOT 밖을 가리킵니다.");
  return { root, projectFolder: canonical };
}

async function resolveFlatJpgFolder(projectFolder: string, name: string): Promise<string> {
  const candidate = path.join(projectFolder, name);
  const metadata = await lstat(candidate).catch(() => null);
  if (!metadata) throw new Error(`${name} 폴더를 찾을 수 없습니다. JPG 통합이 먼저 완료되어야 합니다.`);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${name}이 안전한 폴더가 아닙니다.`);
  const canonical = await realpath(candidate);
  if (!isInside(projectFolder, canonical)) throw new Error(`${name}이 프로젝트 밖을 가리킵니다.`);
  return canonical;
}

/** JPG전체는 평면 구조여야 한다 — 하위 폴더가 있으면 REVIEW_REQUIRED로 처리한다. */
async function collectFlatJpgSnapshot(folder: string): Promise<{ files: PhotoSnapshot[]; hasSubdirectory: boolean }> {
  const files: PhotoSnapshot[] = [];
  let hasSubdirectory = false;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`분류 대상에 심볼릭 링크가 있습니다: ${entry.name}`);
    if (entry.isDirectory()) {
      hasSubdirectory = true;
      continue;
    }
    if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
    const metadata = await stat(path.join(folder, entry.name));
    files.push({ name: entry.name, size: metadata.size });
  }
  files.sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" }));
  return { files, hasSubdirectory };
}

function totalBytes(files: PhotoSnapshot[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function isTempFileName(name: string): boolean {
  return name.startsWith(".") && name.endsWith(".olivia-part");
}

type ClassifiedOutput = { files: PhotoSnapshot[]; sceneCount: number; duplicateNames: string[]; tempFileCount: number };

/** 씬별분류/ 하위를 재귀 스캔해 파일 목록·Scene 폴더 수·중복 배치·임시 파일 잔존 여부를 모은다. */
async function collectClassifiedOutput(sceneRoot: string): Promise<ClassifiedOutput> {
  const files: PhotoSnapshot[] = [];
  const nameCounts = new Map<string, number>();
  let tempFileCount = 0;
  let sceneCount = 0;
  for (const sceneEntry of await readdir(sceneRoot, { withFileTypes: true })) {
    if (sceneEntry.name === "_REPORT") continue;
    if (sceneEntry.isSymbolicLink()) throw new Error(`씬별분류에 심볼릭 링크가 있습니다: ${sceneEntry.name}`);
    if (!sceneEntry.isDirectory()) continue;
    sceneCount += 1;
    const sceneDirectory = path.join(sceneRoot, sceneEntry.name);
    for (const fileEntry of await readdir(sceneDirectory, { withFileTypes: true })) {
      if (fileEntry.isSymbolicLink()) throw new Error(`씬별분류에 심볼릭 링크가 있습니다: ${sceneEntry.name}/${fileEntry.name}`);
      if (!fileEntry.isFile()) continue;
      if (isTempFileName(fileEntry.name)) {
        tempFileCount += 1;
        continue;
      }
      if (!JPG_PHOTO_EXTENSIONS.has(extension(fileEntry.name))) continue;
      const metadata = await stat(path.join(sceneDirectory, fileEntry.name));
      files.push({ name: fileEntry.name, size: metadata.size });
      nameCounts.set(fileEntry.name, (nameCounts.get(fileEntry.name) ?? 0) + 1);
    }
  }
  const duplicateNames = Array.from(nameCounts.entries()).filter(([, count]) => count > 1).map(([name]) => name);
  return { files, sceneCount, duplicateNames, tempFileCount };
}

/** 분류 완료 전 모두 통과해야 하는 무결성 검증. 실패해도 씬별분류는 지우지 않는다. */
function verifyClassifiedOutput(inputBefore: PhotoSnapshot[], output: ClassifiedOutput): string | null {
  if (output.tempFileCount > 0) return "씬별분류에 완료되지 않은 임시 파일이 남아 있습니다.";
  if (output.duplicateNames.length > 0) return `일부 파일이 두 Scene에 중복 배치되었습니다: ${output.duplicateNames.slice(0, 5).join(", ")}`;
  if (output.files.length !== inputBefore.length) {
    return `씬별분류 파일 수가 JPG전체와 다릅니다 (JPG전체 ${inputBefore.length}장 · 씬별분류 ${output.files.length}장).`;
  }
  const inputByName = new Map(inputBefore.map((file) => [file.name, file.size]));
  for (const file of output.files) {
    const expectedSize = inputByName.get(file.name);
    if (expectedSize === undefined) return `씬별분류에 JPG전체에 없는 파일이 있습니다: ${file.name}`;
    if (expectedSize !== file.size) return `${file.name}의 크기가 JPG전체와 다릅니다.`;
  }
  return null;
}

function sameFlatSnapshot(before: PhotoSnapshot[], after: PhotoSnapshot[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((file, index) => after[index]?.name === file.name && after[index]?.size === file.size);
}

function configuredMinFreeBytes(): number {
  const configured = process.env.OLIVIA_WORK_MIN_FREE_GB?.trim();
  if (!configured) return DEFAULT_MIN_FREE_BYTES;
  const gb = Number(configured);
  if (!Number.isFinite(gb) || gb < 0) throw new Error("OLIVIA_WORK_MIN_FREE_GB는 0 이상의 숫자여야 합니다.");
  return gb * 1024 ** 3;
}

export async function runPhotoClassifyWork(
  input: PhotoClassifyWorkInput,
  dependencies: RemotePhotoSortRunnerDependencies = {},
): Promise<PhotoClassifyWorkResult> {
  const workRelativePath = validateRelativePath(input.workRelativePath);
  const roots = input.roots ?? getStorageRoots();
  const { root, projectFolder } = await resolveProjectFolder(workRelativePath, roots);

  const fail = (status: PhotoClassifyWorkFailure["status"], jpgCount: number, error: string): PhotoClassifyWorkFailure => ({
    ok: false,
    status,
    workRelativePath,
    jpgCount,
    error,
  });

  let jpgInputFolder: string;
  try {
    jpgInputFolder = await resolveFlatJpgFolder(projectFolder, JPG_INTEGRATED_DIRECTORY);
  } catch (error) {
    return fail("CLASSIFY_FAILED", 0, error instanceof Error ? error.message : String(error));
  }

  const { files: before, hasSubdirectory } = await collectFlatJpgSnapshot(jpgInputFolder);
  if (hasSubdirectory) return fail("REVIEW_REQUIRED", before.length, "JPG전체 하위에 폴더가 있습니다. JPG전체는 평면 구조여야 합니다.");
  if (!before.length) return fail("CLASSIFY_FAILED", 0, "SSD2 JPG전체에 분류할 JPG/JPEG가 없습니다.");

  const sceneOutputFolder = path.join(projectFolder, SCENE_CLASSIFIED_DIRECTORY);
  const sceneOutputExists = Boolean(await lstat(sceneOutputFolder).catch(() => null));

  if (sceneOutputExists) {
    // Worker 재시작 후 이미 출력이 있는 경우: 다시 분류하지 않고 결과를 검증해
    // 완료로 복구하거나(정확히 일치) REVIEW_REQUIRED로 남긴다. 부분 결과는 지우지 않는다.
    const output = await collectClassifiedOutput(sceneOutputFolder);
    const verificationError = verifyClassifiedOutput(before, output);
    if (verificationError) return fail("REVIEW_REQUIRED", before.length, verificationError);
    return {
      ok: true,
      status: "CLASSIFY_COMPLETED",
      projectPath: workRelativePath,
      workRelativePath,
      jpgCount: before.length,
      sceneCount: output.sceneCount,
      durationMs: 0,
    };
  }

  // 씬별분류는 JPG전체를 복사로 복제하므로 프로젝트당 SSD2 사용량이 약 2배가 된다.
  // 파일을 하나도 만들기 전에 여유 공간을 확인한다.
  const requiredBytes = totalBytes(before);
  const safetyMargin = Math.max(requiredBytes * 0.05, MIN_SAFETY_MARGIN_BYTES, configuredMinFreeBytes());
  const filesystem = await statfs(root);
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isFinite(availableBytes) || availableBytes < requiredBytes + safetyMargin) {
    return fail(
      "CLASSIFY_FAILED",
      before.length,
      `Agentstation 저장 공간이 부족합니다. 현재 여유 ${(availableBytes / 1024 ** 3).toFixed(1)}GB, 필요 ${(requiredBytes / 1024 ** 3).toFixed(1)}GB + 안전 여유 ${(safetyMargin / 1024 ** 3).toFixed(1)}GB`,
    );
  }

  // workFolder 모드에서는 Runner가 source staging을 호출하지 않는다. sourceRoot도
  // SSD2로 격리해 PHOTO_CLASSIFY_WORK 경로가 SSD1에 접근하지 않도록 한다.
  const isolatedRoots: RunnerRoots = { sourceRoot: root, workRoot: root };
  const startedAt = Date.now();
  try {
    const result = await runRemotePhotoSortRunner({
      shootingMode: input.shootingMode,
      department: input.department,
      gapMinutes: input.gapMinutes,
      classificationUiMode: input.classificationUiMode,
      fastAnalyzeMode: input.fastAnalyzeMode,
      departmentLogicEnabled: input.departmentLogicEnabled,
      aiNamingEnabled: input.aiNamingEnabled,
      qualityAnalysisEnabled: input.qualityAnalysisEnabled,
      profileClassificationEnabled: input.profileClassificationEnabled,
      workFolder: jpgInputFolder,
    }, {
      ...dependencies,
      roots: isolatedRoots,
      preserveRaw: true,
      outputMode: "copy",
    });

    // JPG전체가 분류 도중 한 장도 이동·삭제되지 않았는지 먼저 확인한다(읽기 전용 불변식).
    const { files: after, hasSubdirectory: afterHasSubdirectory } = await collectFlatJpgSnapshot(jpgInputFolder);
    if (afterHasSubdirectory || !sameFlatSnapshot(before, after)) {
      return fail("REVIEW_REQUIRED", before.length, "분류 후 JPG전체의 파일 수·이름·용량이 분류 전과 다릅니다.");
    }

    const output = await collectClassifiedOutput(sceneOutputFolder);
    const verificationError = verifyClassifiedOutput(before, output);
    if (verificationError) return fail("REVIEW_REQUIRED", before.length, verificationError);

    return {
      ok: true,
      status: "CLASSIFY_COMPLETED",
      projectPath: workRelativePath,
      workRelativePath,
      jpgCount: before.length,
      sceneCount: result.sceneCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return fail("CLASSIFY_FAILED", before.length, error instanceof Error ? error.message : String(error));
  }
}

export function parseClassificationOptions(payload: Record<string, unknown>): RemotePhotoSortRunnerOptions {
  const department = typeof payload.department === "string" ? payload.department : PHOTO_CLASSIFY_DEFAULT_OPTIONS.department;
  const allowedDepartments: MedicalDepartment[] = [
    "dermatology", "dentistry", "ophthalmology", "orthopedics_neurosurgery", "pediatrics",
    "korean_medicine", "plastic_surgery", "obgyn", "internal_medicine_checkup", "general",
  ];
  const shootingMode = payload.shooting_mode === "studio" ? "studio" : "field";
  const classificationUiMode = payload.classification_ui_mode === "advanced" ? "advanced" : "ai-auto";
  const gapMinutes = typeof payload.gap_minutes === "number" && Number.isFinite(payload.gap_minutes) && payload.gap_minutes > 0
    ? payload.gap_minutes
    : PHOTO_CLASSIFY_DEFAULT_OPTIONS.gapMinutes;
  return {
    ...PHOTO_CLASSIFY_DEFAULT_OPTIONS,
    shootingMode,
    department: allowedDepartments.includes(department as MedicalDepartment) ? department as MedicalDepartment : PHOTO_CLASSIFY_DEFAULT_OPTIONS.department,
    classificationUiMode,
    gapMinutes,
    fastAnalyzeMode: typeof payload.fast_analyze_mode === "boolean" ? payload.fast_analyze_mode : PHOTO_CLASSIFY_DEFAULT_OPTIONS.fastAnalyzeMode,
    departmentLogicEnabled: typeof payload.department_logic_enabled === "boolean" ? payload.department_logic_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.departmentLogicEnabled,
    aiNamingEnabled: typeof payload.ai_naming_enabled === "boolean" ? payload.ai_naming_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.aiNamingEnabled,
    qualityAnalysisEnabled: typeof payload.quality_analysis_enabled === "boolean" ? payload.quality_analysis_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.qualityAnalysisEnabled,
    profileClassificationEnabled: typeof payload.profile_classification_enabled === "boolean" ? payload.profile_classification_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.profileClassificationEnabled,
  };
}

export type { RunnerProgress };
