import { lstat, readdir, realpath, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import { runRemotePhotoSortRunner, type RemotePhotoSortRunnerDependencies } from "./remotePhotoSortRunner";
import { resolveSafeWorkRoot } from "./pathSafety";
import { getStorageRoots } from "./storageConfig";
import { JPG_INTEGRATED_DIRECTORY, SCENE_CLASSIFIED_DIRECTORY } from "./storageLayout";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { RemotePhotoSortRunnerOptions, RunnerProgress, RunnerRoots } from "./types";
import type { RunnerWarning } from "./types";

export const PHOTO_CLASSIFY_DEFAULT_OPTIONS: RemotePhotoSortRunnerOptions = {
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
  /** 테스트·운영 점검에서 기본 30GB 여유 기준을 명시적으로 조정할 때만 사용한다. */
  minFreeBytes?: number;
};

export type PhotoClassifyWorkSuccess = {
  ok: true;
  status: "CLASSIFY_COMPLETED";
  projectPath: string;
  workRelativePath: string;
  jpgCount: number;
  sceneCount: number;
  durationMs: number;
  warnings: RunnerWarning[];
};

export type PhotoClassifyWorkFailure = {
  ok: false;
  status: "CLASSIFY_FAILED" | "REVIEW_REQUIRED";
  workRelativePath: string;
  jpgCount: number;
  error: string;
};

export type PhotoClassifyWorkResult = PhotoClassifyWorkSuccess | PhotoClassifyWorkFailure;

type PhotoSnapshot = { name: string; relativePath: string; size: number };
type JpgBundle = { relativePath: string; folder: string; files: PhotoSnapshot[] };

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

/**
 * JPG전체의 각 하위 폴더는 서로 섞으면 안 되는 독립 촬영 묶음이다.
 * 폴더명은 분류 근거로 쓰지 않고, 단지 AI 판정·다수결의 경계를 만드는 데만 쓴다.
 */
async function collectJpgBundles(folder: string): Promise<JpgBundle[]> {
  const bundles: JpgBundle[] = [];
  const visit = async (current: string, relativePath: string): Promise<void> => {
    const files: PhotoSnapshot[] = [];
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`분류 대상에 심볼릭 링크가 있습니다: ${relativePath ? `${relativePath}/` : ""}${entry.name}`);
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath ? path.posix.join(relativePath, entry.name) : entry.name);
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      files.push({ name: entry.name, relativePath: relativePath ? path.posix.join(relativePath, entry.name) : entry.name, size: metadata.size });
    }
    if (files.length) {
      files.sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" }));
      bundles.push({ relativePath, folder: current, files });
    }
  };
  await visit(folder, "");
  return bundles.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

function totalBytes(files: PhotoSnapshot[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function isTempFileName(name: string): boolean {
  return name.startsWith(".") && name.endsWith(".olivia-part");
}

type ClassifiedOutput = { files: PhotoSnapshot[]; sceneCount: number; duplicateKeys: string[]; tempFileCount: number };

/** 씬별분류/ 하위를 재귀 스캔해 파일 목록·Scene 폴더 수·중복 배치·임시 파일 잔존 여부를 모은다. */
async function collectClassifiedOutput(sceneRoot: string): Promise<ClassifiedOutput> {
  const files: PhotoSnapshot[] = [];
  const keyCounts = new Map<string, number>();
  let tempFileCount = 0;
  let sceneCount = 0;
  const visit = async (directory: string, relativePath: string): Promise<void> => {
    let directPhotoCount = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relativeFilePath = relativePath ? path.posix.join(relativePath, entry.name) : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`씬별분류에 심볼릭 링크가 있습니다: ${relativeFilePath}`);
      if (entry.isDirectory()) {
        if (entry.name !== "_REPORT") await visit(fullPath, relativeFilePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isTempFileName(entry.name)) {
        tempFileCount += 1;
        continue;
      }
      if (!JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      files.push({ name: entry.name, relativePath: relativeFilePath, size: metadata.size });
      // 같은 하위 촬영 묶음 안에서만 이름 충돌을 본다. 다른 하위 폴더의 IMG_0001은 정상이다.
      const bundleAndName = `${path.posix.dirname(path.posix.dirname(relativeFilePath))}/${entry.name}`;
      keyCounts.set(bundleAndName, (keyCounts.get(bundleAndName) ?? 0) + 1);
      directPhotoCount += 1;
    }
    if (directPhotoCount) sceneCount += 1;
  };
  await visit(sceneRoot, "");
  const duplicateKeys = Array.from(keyCounts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
  return { files, sceneCount, duplicateKeys, tempFileCount };
}

/** 분류 완료 전 모두 통과해야 하는 무결성 검증. 실패해도 씬별분류는 지우지 않는다. */
function verifyClassifiedOutput(inputBefore: PhotoSnapshot[], output: ClassifiedOutput, expectedCount = inputBefore.length): string | null {
  if (output.tempFileCount > 0) return "씬별분류에 완료되지 않은 임시 파일이 남아 있습니다.";
  if (output.duplicateKeys.length > 0) return `일부 파일이 두 Scene에 중복 배치되었습니다: ${output.duplicateKeys.slice(0, 5).join(", ")}`;
  if (output.files.length !== expectedCount) {
    return `씬별분류 파일 수가 요청 결과와 다릅니다 (예상 ${expectedCount}장 · 씬별분류 ${output.files.length}장).`;
  }
  const inputByName = new Map(inputBefore.map((file) => [`${file.name}:${file.size}`, (inputBefore.filter((candidate) => candidate.name === file.name && candidate.size === file.size).length)]));
  const outputCounts = new Map<string, number>();
  for (const file of output.files) {
    const key = `${file.name}:${file.size}`;
    if (!inputByName.has(key)) return `씬별분류에 JPG전체에 없는 파일이 있습니다: ${file.name}`;
    outputCounts.set(key, (outputCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of inputByName) if (outputCounts.get(key) !== count) return `씬별분류 파일 구성이 JPG전체와 다릅니다: ${key}`;
  return null;
}

function sameJpgSnapshot(before: PhotoSnapshot[], after: PhotoSnapshot[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((file, index) => after[index]?.relativePath === file.relativePath && after[index]?.name === file.name && after[index]?.size === file.size);
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

  const bundles = await collectJpgBundles(jpgInputFolder);
  const before = bundles.flatMap((bundle) => bundle.files);
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
      warnings: [],
    };
  }

  // 씬별분류는 JPG전체를 복사로 복제하므로 프로젝트당 SSD2 사용량이 약 2배가 된다.
  // 파일을 하나도 만들기 전에 여유 공간을 확인한다.
  const requiredBytes = totalBytes(before);
  const safetyMargin = Math.max(
    requiredBytes * 0.05,
    MIN_SAFETY_MARGIN_BYTES,
    input.minFreeBytes ?? configuredMinFreeBytes(),
  );
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
    const results = [];
    for (const bundle of bundles) {
      const bundleOutput = bundle.relativePath
        ? path.join(sceneOutputFolder, ...bundle.relativePath.split("/"))
        : sceneOutputFolder;
      results.push(await runRemotePhotoSortRunner({
        department: input.department,
        gapMinutes: input.gapMinutes,
        classificationUiMode: input.classificationUiMode,
        fastAnalyzeMode: input.fastAnalyzeMode,
        departmentLogicEnabled: input.departmentLogicEnabled,
        aiNamingEnabled: input.aiNamingEnabled,
        qualityAnalysisEnabled: input.qualityAnalysisEnabled,
        profileClassificationEnabled: input.profileClassificationEnabled,
        only: input.only,
        workFolder: bundle.folder,
      }, {
        ...dependencies,
        roots: isolatedRoots,
        preserveRaw: true,
        outputMode: "copy",
        sceneOutputFolder: bundleOutput,
      }));
    }

    // JPG전체가 분류 도중 한 장도 이동·삭제되지 않았는지 먼저 확인한다(읽기 전용 불변식).
    const after = (await collectJpgBundles(jpgInputFolder)).flatMap((bundle) => bundle.files);
    if (!sameJpgSnapshot(before, after)) {
      return fail("REVIEW_REQUIRED", before.length, "분류 후 JPG전체의 파일 수·이름·용량이 분류 전과 다릅니다.");
    }

    const output = await collectClassifiedOutput(sceneOutputFolder);
    const resultJpgCount = results.reduce((sum, result) => sum + result.jpgCount, 0);
    const verificationError = verifyClassifiedOutput(before, output, resultJpgCount);
    if (verificationError) return fail("REVIEW_REQUIRED", before.length, verificationError);

    return {
      ok: true,
      status: "CLASSIFY_COMPLETED",
      projectPath: workRelativePath,
      workRelativePath,
      jpgCount: resultJpgCount,
      sceneCount: results.reduce((sum, result) => sum + result.sceneCount, 0),
      durationMs: Date.now() - startedAt,
      warnings: results.flatMap((result) => result.warnings),
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
  const classificationUiMode = payload.classification_ui_mode === "advanced" ? "advanced" : "ai-auto";
  const only = payload.only === "연출" || payload.only === "프로필" || payload.only === "인테리어" ? payload.only : "all";
  const gapMinutes = typeof payload.gap_minutes === "number" && Number.isFinite(payload.gap_minutes) && payload.gap_minutes > 0
    ? payload.gap_minutes
    : PHOTO_CLASSIFY_DEFAULT_OPTIONS.gapMinutes;
  return {
    ...PHOTO_CLASSIFY_DEFAULT_OPTIONS,
    department: allowedDepartments.includes(department as MedicalDepartment) ? department as MedicalDepartment : PHOTO_CLASSIFY_DEFAULT_OPTIONS.department,
    classificationUiMode,
    gapMinutes,
    fastAnalyzeMode: typeof payload.fast_analyze_mode === "boolean" ? payload.fast_analyze_mode : PHOTO_CLASSIFY_DEFAULT_OPTIONS.fastAnalyzeMode,
    departmentLogicEnabled: typeof payload.department_logic_enabled === "boolean" ? payload.department_logic_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.departmentLogicEnabled,
    aiNamingEnabled: typeof payload.ai_naming_enabled === "boolean" ? payload.ai_naming_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.aiNamingEnabled,
    qualityAnalysisEnabled: typeof payload.quality_analysis_enabled === "boolean" ? payload.quality_analysis_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.qualityAnalysisEnabled,
    profileClassificationEnabled: typeof payload.profile_classification_enabled === "boolean" ? payload.profile_classification_enabled : PHOTO_CLASSIFY_DEFAULT_OPTIONS.profileClassificationEnabled,
    only,
  };
}

export type { RunnerProgress };
