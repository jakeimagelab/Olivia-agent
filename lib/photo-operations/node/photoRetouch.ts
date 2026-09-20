import { lstat, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RunnerProgress, RunnerRoots } from "@/lib/photo-classifier/node/types";
import { analyzePhotoColor, type PhotoColorCheckAnalyzer, type PhotoColorCheckType } from "@/lib/photoRetouch/colorCheckService";
import { ensureSafeDirectory, extension, posixRelative, resolvePhotoWorkProjectDirectory } from "./common";

const REPORT_DIRECTORY = "RETOUCH_REPORT";

type WorkPhoto = { path: string; relativePath: string; name: string; size: number; mtimeMs: number };

export type PhotoRetouchInput = {
  projectRelativePath: string;
  fileNames: string[];
  checkType?: PhotoColorCheckType;
  roots?: RunnerRoots;
  analyzer?: PhotoColorCheckAnalyzer;
  onProgress?: (progress: RunnerProgress) => void;
};

export type PhotoRetouchResult = {
  ok: boolean;
  status: "RETOUCH_ANALYSIS_COMPLETED" | "REVIEW_REQUIRED" | "RETOUCH_ANALYSIS_FAILED";
  projectRelativePath: string;
  checkType: PhotoColorCheckType;
  requestedCount: number;
  analyzedCount: number;
  reportRelativePath: string;
  sourceUnchanged: boolean;
  results?: Array<{ fileName: string; relativePath: string; analysis: Record<string, unknown> }>;
  error?: string;
};

async function collectPhotos(projectRoot: string): Promise<WorkPhoto[]> {
  const photos: WorkPhoto[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`SSD2 프로젝트에 심볼릭 링크가 있습니다: ${posixRelative(projectRoot, fullPath)}`);
      if (entry.isDirectory()) {
        if (entry.name === REPORT_DIRECTORY || entry.name === ".olivia") continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      photos.push({ path: fullPath, relativePath: posixRelative(projectRoot, fullPath), name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(projectRoot);
  return photos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

function sameSnapshot(before: WorkPhoto[], after: WorkPhoto[]): boolean {
  return before.length === after.length && before.every((file, index) => {
    const current = after[index];
    return current?.relativePath === file.relativePath && current.size === file.size && current.mtimeMs === file.mtimeMs;
  });
}

function safeNames(input: string[]): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) throw new Error("보정 분석할 JPG 파일명을 1~10개 지정해주세요.");
  const names = input.map((value) => path.basename(String(value).trim())).filter(Boolean);
  if (names.length !== input.length || names.some((name) => name.includes("\0") || name === "." || name === "..")) throw new Error("보정 분석 파일명이 올바르지 않습니다.");
  return [...new Set(names)];
}

export async function runPhotoRetouch(input: PhotoRetouchInput): Promise<PhotoRetouchResult> {
  const checkType = input.checkType ?? "skin";
  const fileNames = safeNames(input.fileNames);
  const directories = await resolvePhotoWorkProjectDirectory({ projectRelativePath: input.projectRelativePath, roots: input.roots });
  const reportDirectory = path.join(directories.workProject, REPORT_DIRECTORY);
  const reportRelativePath = `${REPORT_DIRECTORY}/analysis-manifest.json`;
  const manifestPath = path.join(reportDirectory, "analysis-manifest.json");
  const photosBefore = await collectPhotos(directories.workProject);
  const byName = new Map<string, WorkPhoto[]>();
  for (const photo of photosBefore) byName.set(photo.name.toLocaleLowerCase("en-US"), [...(byName.get(photo.name.toLocaleLowerCase("en-US")) ?? []), photo]);
  const missing = fileNames.filter((name) => !byName.has(name.toLocaleLowerCase("en-US")));
  const ambiguous = fileNames.filter((name) => (byName.get(name.toLocaleLowerCase("en-US"))?.length ?? 0) > 1);
  if (missing.length || ambiguous.length) {
    return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: 0, reportRelativePath, sourceUnchanged: true, error: missing.length ? `사진을 찾지 못했습니다: ${missing.join(", ")}` : `같은 파일명이 여러 폴더에 있습니다: ${ambiguous.join(", ")}` };
  }
  const existing = await lstat(manifestPath).catch(() => null);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: 0, reportRelativePath, sourceUnchanged: true, error: "기존 보정 분석 결과가 안전한 파일이 아닙니다." };
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const previous = Array.isArray(manifest.fileNames) ? manifest.fileNames : [];
    if (manifest.status === "RETOUCH_ANALYSIS_COMPLETED" && manifest.checkType === checkType && JSON.stringify(previous) === JSON.stringify(fileNames)) {
      const previousResults = Array.isArray(manifest.results) ? manifest.results as Array<{ fileName: string; relativePath: string; analysis: Record<string, unknown> }> : undefined;
      return { ok: true, status: "RETOUCH_ANALYSIS_COMPLETED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: Number(manifest.analyzedCount) || fileNames.length, reportRelativePath, sourceUnchanged: true, results: previousResults };
    }
    return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: 0, reportRelativePath, sourceUnchanged: true, error: "다른 조건의 보정 분석 결과가 이미 있습니다." };
  }
  const results: Array<{ fileName: string; relativePath: string; analysis: Record<string, unknown> }> = [];
  try {
    input.onProgress?.({ stage: "ANALYZING", current: 0, total: fileNames.length, message: "선택 사진의 피부·가운 색상 보정값을 분석하고 있습니다." });
    for (const fileName of fileNames) {
      const photo = byName.get(fileName.toLocaleLowerCase("en-US"))![0];
      const image = await sharp(photo.path).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      const analysis = await analyzePhotoColor({ imageBase64: image.toString("base64"), imageMime: "image/jpeg", checkType, analyzer: input.analyzer });
      results.push({ fileName: photo.name, relativePath: photo.relativePath, analysis });
      input.onProgress?.({ stage: "ANALYZING", current: results.length, total: fileNames.length, message: `보정 분석: ${photo.name}` });
    }
    const sourceUnchanged = sameSnapshot(photosBefore, await collectPhotos(directories.workProject));
    if (!sourceUnchanged) throw new Error("보정 분석 후 SSD2 사진 원본이 변경되었습니다.");
    input.onProgress?.({ stage: "VERIFYING", current: results.length, total: fileNames.length, message: "보정 가이드와 사진 원본 불변 상태를 확인하고 있습니다." });
    await ensureSafeDirectory(directories.workRoot, reportDirectory);
    const temporary = path.join(reportDirectory, ".analysis-manifest.json.tmp");
    await writeFile(temporary, `${JSON.stringify({ status: "RETOUCH_ANALYSIS_COMPLETED", projectRelativePath: directories.relativePath, checkType, fileNames, analyzedCount: results.length, sourceUnchanged, completedAt: new Date().toISOString(), results }, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, manifestPath);
    return { ok: true, status: "RETOUCH_ANALYSIS_COMPLETED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: results.length, reportRelativePath, sourceUnchanged, results };
  } catch (error) {
    const sourceUnchanged = sameSnapshot(photosBefore, await collectPhotos(directories.workProject).catch(() => []));
    return { ok: false, status: "RETOUCH_ANALYSIS_FAILED", projectRelativePath: directories.relativePath, checkType, requestedCount: fileNames.length, analyzedCount: results.length, reportRelativePath, sourceUnchanged, error: error instanceof Error ? error.message : "보정 분석 중 오류가 발생했습니다." };
  }
}

export const PHOTO_RETOUCH_REPORT_DIRECTORY = REPORT_DIRECTORY;
