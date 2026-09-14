import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import { runRemotePhotoSortRunner, type RemotePhotoSortRunnerDependencies } from "./remotePhotoSortRunner";
import { resolveSafeWorkRoot } from "./pathSafety";
import { getStorageRoots } from "./storageConfig";
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
  profileClassificationEnabled: true,
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

type PhotoSnapshot = { relativePath: string; name: string; size: number };

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

async function resolveWorkFolder(relativePath: string, roots: RunnerRoots): Promise<{ root: string; folder: string }> {
  const root = await resolveSafeWorkRoot(roots);
  const candidate = path.resolve(root, ...relativePath.split("/"));
  if (!isInside(root, candidate)) throw new Error("분류 작업 폴더가 WORK_ROOT 밖입니다.");
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("분류 작업 폴더가 안전한 폴더가 아닙니다.");
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error("분류 작업 폴더가 WORK_ROOT 밖을 가리킵니다.");
  return { root, folder: canonical };
}

async function collectJpgSnapshot(root: string): Promise<PhotoSnapshot[]> {
  const files: PhotoSnapshot[] = [];
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`분류 대상에 심볼릭 링크가 있습니다: ${entry.name}`);
      if (entry.isDirectory()) {
        await visit(fullPath, path.posix.join(relativeDirectory, entry.name));
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      files.push({ relativePath: path.posix.join(relativeDirectory, entry.name), name: entry.name, size: metadata.size });
    }
  };
  await visit(root, "");
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

async function readExistingSceneCount(folder: string): Promise<number> {
  try {
    const report = JSON.parse(await readFile(path.join(folder, "REPORT", "summary.json"), "utf8")) as { totalScenes?: unknown };
    if (typeof report.totalScenes === "number" && Number.isSafeInteger(report.totalScenes) && report.totalScenes >= 0) return report.totalScenes;
  } catch {
    // A partial report is handled by the file-count verification below.
  }
  try {
    const entries = await readdir(path.join(folder, "JPG"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && entry.name !== "00_QUALITY_EXCLUDED").length;
  } catch {
    return 0;
  }
}

async function hasExistingOutputDirectory(folder: string): Promise<boolean> {
  for (const name of ["RAW", "JPG", "SELECT", "REPORT", "PROFILE"]) {
    const metadata = await lstat(path.join(folder, name)).catch(() => null);
    if (metadata) return true;
  }
  return false;
}

function totalBytes(files: PhotoSnapshot[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function sameManagedSnapshot(before: PhotoSnapshot[], after: PhotoSnapshot[]): boolean {
  if (before.length !== after.length) return false;
  const beforeNames = new Map<string, number>();
  for (const file of before) beforeNames.set(file.name, (beforeNames.get(file.name) ?? 0) + 1);
  const afterNames = new Map<string, number>();
  for (const file of after) afterNames.set(file.name, (afterNames.get(file.name) ?? 0) + 1);
  if (beforeNames.size !== afterNames.size) return false;
  for (const [name, count] of beforeNames) if (afterNames.get(name) !== count) return false;
  return totalBytes(before) === totalBytes(after);
}

function hasNestedJpg(files: PhotoSnapshot[]): boolean {
  return files.some((file) => file.relativePath.includes("/"));
}

function hasRootJpg(files: PhotoSnapshot[]): boolean {
  return files.some((file) => !file.relativePath.includes("/"));
}

export async function runPhotoClassifyWork(
  input: PhotoClassifyWorkInput,
  dependencies: RemotePhotoSortRunnerDependencies = {},
): Promise<PhotoClassifyWorkResult> {
  const workRelativePath = validateRelativePath(input.workRelativePath);
  const roots = input.roots ?? getStorageRoots();
  const { root, folder } = await resolveWorkFolder(workRelativePath, roots);
  const before = await collectJpgSnapshot(folder);
  const fail = (status: PhotoClassifyWorkFailure["status"], error: string): PhotoClassifyWorkFailure => ({
    ok: false,
    status,
    workRelativePath,
    jpgCount: before.length,
    error,
  });

  if (!before.length) return fail("CLASSIFY_FAILED", "SSD2 작업 폴더에 분류할 JPG/JPEG가 없습니다.");
  if (hasNestedJpg(before)) {
    // Worker 재시작 후 이미 출력이 완성된 경우에는 다시 분류하지 않고 결과를
    // 검증해 완료로 복구한다. 부분/불일치 output은 REVIEW_REQUIRED로 남긴다.
    const hasRoot = hasRootJpg(before);
    if (!hasRoot && input.expectedJpgCount !== undefined && input.expectedJpgBytes !== undefined
      && before.length === input.expectedJpgCount && totalBytes(before) === input.expectedJpgBytes) {
      return {
        ok: true,
        status: "CLASSIFY_COMPLETED",
        projectPath: workRelativePath,
        workRelativePath,
        jpgCount: before.length,
        sceneCount: await readExistingSceneCount(folder),
        durationMs: 0,
      };
    }
    return fail("REVIEW_REQUIRED", "분류 대상 JPG가 프로젝트 하위 폴더에 이미 존재합니다.");
  }
  if (await hasExistingOutputDirectory(folder)) {
    return fail("REVIEW_REQUIRED", "SSD2 작업 폴더에 기존 분류 output이 있어 재분류하지 않습니다.");
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
      workFolder: folder,
    }, {
      ...dependencies,
      roots: isolatedRoots,
      preserveRaw: true,
    });

    const after = await collectJpgSnapshot(folder);
    if (hasRootJpg(after)) return fail("REVIEW_REQUIRED", "분류 후 프로젝트 루트에 JPG가 남아 있습니다.");
    if (!sameManagedSnapshot(before, after)) {
      return fail("REVIEW_REQUIRED", "분류 전후 JPG 파일 수·이름·용량이 일치하지 않습니다.");
    }
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
    return fail("CLASSIFY_FAILED", error instanceof Error ? error.message : String(error));
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
